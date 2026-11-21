import { randomBytes, randomUUID } from "node:crypto";
import type { Sql } from "./db.js";
import { getDb } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";

export type DirectoryUser = {
  id: string;
  tenantId: string;
  userPrincipalName: string;
  displayName: string;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
};

export type DirectoryGroup = {
  id: string;
  tenantId: string;
  displayName: string;
  mailNickname: string | null;
};

export type DirectoryApp = {
  appId: string;
  tenantId: string;
  displayName: string;
  publicClient: boolean;
  redirectUris: string[];
  hasSecret: boolean;
  appRoles: string[];
  assignedRoles: string[];
};

export class DirectoryStore {
  constructor(private readonly sql: Sql) {}

  async ensureContosoDemo(): Promise<void> {
    const tenantId = "11111111-1111-1111-1111-111111111111";
    const aliceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
    const bobId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
    const groupId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
    const spaId = "cccccccc-cccc-cccc-cccc-ccccccccccc1";
    const daemonId = "dddddddd-dddd-dddd-dddd-ddddddddddd1";

    await this.sql`
      insert into tenants (id, display_name, default_domain)
      values (${tenantId}, ${"Contoso Ltd"}, ${"contoso.test"})
      on conflict (id) do nothing
    `;

    for (const u of [
      { id: aliceId, upn: "alice@contoso.test", name: "Alice Contoso", title: "Ingeniera", dept: "Ingeniería" },
      { id: bobId, upn: "bob@contoso.test", name: "Bob Contoso", title: "Manager", dept: "Ingeniería" },
    ]) {
      await this.sql`
        insert into directory_users (
          id, tenant_id, user_principal_name, display_name, password_hash, job_title, department
        ) values (
          ${u.id}, ${tenantId}, ${u.upn}, ${u.name}, ${hashPassword("Password1!")}, ${u.title}, ${u.dept}
        )
        on conflict (id) do nothing
      `;
    }

    await this.sql`
      insert into directory_groups (id, tenant_id, display_name, mail_nickname)
      values (${groupId}, ${tenantId}, ${"Ingeniería"}, ${"ingenieria"})
      on conflict (id) do nothing
    `;
    await this.sql`
      insert into directory_group_members (group_id, user_id)
      values (${groupId}, ${aliceId})
      on conflict do nothing
    `;

    await this.sql`
      insert into directory_applications (app_id, tenant_id, display_name, public_client, client_secret_hash)
      values (${spaId}, ${tenantId}, ${"ms-sandbox demo SPA"}, true, null)
      on conflict (app_id) do nothing
    `;
    for (const uri of [
      "http://localhost:5173",
      "http://localhost:5173/",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5173/",
    ]) {
      await this.sql`
        insert into directory_redirect_uris (app_id, redirect_uri)
        values (${spaId}, ${uri})
        on conflict do nothing
      `;
    }

    const daemonSecretHash = hashPassword("DaemonSecret1!");
    await this.sql`
      insert into directory_applications (app_id, tenant_id, display_name, public_client, client_secret_hash)
      values (${daemonId}, ${tenantId}, ${"ms-sandbox daemon"}, false, ${daemonSecretHash})
      on conflict (app_id) do update
        set client_secret_hash = excluded.client_secret_hash,
            display_name = excluded.display_name,
            public_client = excluded.public_client
    `;
    const roles = await this.sql<{ value: string }[]>`
      select value from directory_app_roles where app_id = ${daemonId}
    `;
    if (!roles.some((r) => r.value === "User.Read.All")) {
      await this.sql`
        insert into directory_app_roles (id, app_id, value, display_name)
        values (${randomUUID()}, ${daemonId}, ${"User.Read.All"}, ${"Read all users"})
      `;
    }
    const assigns = await this.sql<{ role_value: string }[]>`
      select role_value from directory_app_role_assignments where app_id = ${daemonId}
    `;
    if (!assigns.some((a) => a.role_value === "User.Read.All")) {
      await this.sql`
        insert into directory_app_role_assignments (id, app_id, role_value)
        values (${randomUUID()}, ${daemonId}, ${"User.Read.All"})
      `;
    }

    for (const g of [
      { upn: "alice@contoso.test", scopes: "openid profile offline_access User.Read" },
      { upn: "admin", scopes: "openid profile offline_access User.Read Mail.Read" },
    ]) {
      await this.sql`
        insert into directory_oauth2_grants (id, tenant_id, app_id, principal_upn, scopes)
        values (${randomUUID()}, ${tenantId}, ${spaId}, ${g.upn}, ${g.scopes})
        on conflict (tenant_id, app_id, principal_upn)
        do update set scopes = excluded.scopes
      `;
    }
  }

  async listUsers(tenantId: string): Promise<DirectoryUser[]> {
    const rows = await this.sql<DbUser[]>`
      select * from directory_users where tenant_id = ${tenantId} order by user_principal_name
    `;
    return rows.map(mapUser);
  }

  async getUserById(tenantId: string, id: string): Promise<DirectoryUser | null> {
    const rows = await this.sql<DbUser[]>`
      select * from directory_users where tenant_id = ${tenantId} and id = ${id}
    `;
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserByUpn(tenantId: string, upn: string): Promise<(DirectoryUser & { passwordHash: string }) | null> {
    const rows = await this.sql<DbUser[]>`
      select * from directory_users
      where tenant_id = ${tenantId} and lower(user_principal_name) = ${upn.toLowerCase()}
    `;
    if (!rows[0]) return null;
    return { ...mapUser(rows[0]), passwordHash: rows[0].password_hash };
  }

  async authenticate(tenantId: string, upn: string, password: string): Promise<DirectoryUser | null> {
    const user = await this.getUserByUpn(tenantId, upn);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async createUser(input: {
    tenantId: string;
    id?: string;
    userPrincipalName: string;
    displayName: string;
    password: string;
    jobTitle?: string;
    department?: string;
  }): Promise<DirectoryUser> {
    const id = input.id ?? randomUUID();
    const rows = await this.sql<DbUser[]>`
      insert into directory_users (
        id, tenant_id, user_principal_name, display_name, password_hash, job_title, department
      ) values (
        ${id}, ${input.tenantId}, ${input.userPrincipalName}, ${input.displayName},
        ${hashPassword(input.password)}, ${input.jobTitle ?? null}, ${input.department ?? null}
      )
      returning *
    `;
    return mapUser(rows[0]!);
  }

  async listGroups(tenantId: string): Promise<DirectoryGroup[]> {
    const rows = await this.sql<DbGroup[]>`
      select * from directory_groups where tenant_id = ${tenantId} order by display_name
    `;
    return rows.map(mapGroup);
  }

  async getGroup(tenantId: string, id: string): Promise<DirectoryGroup | null> {
    const rows = await this.sql<DbGroup[]>`
      select * from directory_groups where tenant_id = ${tenantId} and id = ${id}
    `;
    return rows[0] ? mapGroup(rows[0]) : null;
  }

  async listGroupMembers(groupId: string): Promise<DirectoryUser[]> {
    const rows = await this.sql<DbUser[]>`
      select u.* from directory_users u
      join directory_group_members m on m.user_id = u.id
      where m.group_id = ${groupId}
    `;
    return rows.map(mapUser);
  }

  async listUserMemberOf(userId: string): Promise<DirectoryGroup[]> {
    const rows = await this.sql<DbGroup[]>`
      select g.* from directory_groups g
      join directory_group_members m on m.group_id = g.id
      where m.user_id = ${userId}
    `;
    return rows.map(mapGroup);
  }

  async getApp(tenantId: string, appId: string): Promise<DirectoryApp | null> {
    const rows = await this.sql<DbApp[]>`
      select * from directory_applications where tenant_id = ${tenantId} and app_id = ${appId}
    `;
    if (!rows[0]) return null;
    const redirects = await this.sql<{ redirect_uri: string }[]>`
      select redirect_uri from directory_redirect_uris where app_id = ${appId}
    `;
    const roles = await this.sql<{ value: string }[]>`
      select value from directory_app_roles where app_id = ${appId}
    `;
    const assigned = await this.sql<{ role_value: string }[]>`
      select role_value from directory_app_role_assignments where app_id = ${appId}
    `;
    return mapApp(rows[0], redirects.map((r) => r.redirect_uri), roles.map((r) => r.value), assigned.map((a) => a.role_value));
  }

  async listApps(tenantId: string): Promise<DirectoryApp[]> {
    const rows = await this.sql<DbApp[]>`
      select * from directory_applications where tenant_id = ${tenantId}
    `;
    const out: DirectoryApp[] = [];
    for (const row of rows) {
      const app = await this.getApp(tenantId, row.app_id);
      if (app) out.push(app);
    }
    return out;
  }

  async verifyClientSecret(tenantId: string, appId: string, secret: string): Promise<boolean> {
    const rows = await this.sql<{ client_secret_hash: string | null }[]>`
      select client_secret_hash from directory_applications
      where tenant_id = ${tenantId} and app_id = ${appId}
    `;
    const hash = rows[0]?.client_secret_hash;
    if (!hash) return false;
    return verifyPassword(secret, hash);
  }

  async getConsentScopes(tenantId: string, appId: string, upn: string): Promise<string[]> {
    const rows = await this.sql<{ scopes: string }[]>`
      select scopes from directory_oauth2_grants
      where tenant_id = ${tenantId} and app_id = ${appId}
        and (lower(principal_upn) = ${upn.toLowerCase()} or principal_upn = 'admin')
    `;
    const set = new Set<string>();
    for (const row of rows) {
      for (const s of row.scopes.split(/\s+/).filter(Boolean)) set.add(s);
    }
    return [...set];
  }

  async setConsent(input: {
    tenantId: string;
    appId: string;
    principalUpn: string;
    scopes: string[];
  }): Promise<void> {
    await this.sql`
      insert into directory_oauth2_grants (id, tenant_id, app_id, principal_upn, scopes)
      values (
        ${randomUUID()}, ${input.tenantId}, ${input.appId}, ${input.principalUpn},
        ${input.scopes.join(" ")}
      )
      on conflict (tenant_id, app_id, principal_upn)
      do update set scopes = excluded.scopes
    `;
  }

  async createRefreshToken(input: {
    tenantId: string;
    clientId: string;
    userId: string | null;
    scopes: string[];
    familyId?: string;
  }): Promise<string> {
    const id = randomBytes(32).toString("base64url");
    const familyId = input.familyId ?? randomBytes(16).toString("base64url");
    await this.sql`
      insert into directory_refresh_tokens (
        id, tenant_id, client_id, user_id, scopes, expires_at, family_id, revoked
      ) values (
        ${id}, ${input.tenantId}, ${input.clientId}, ${input.userId},
        ${input.scopes.join(" ")}, ${new Date(Date.now() + 7 * 24 * 3600 * 1000)},
        ${familyId}, false
      )
    `;
    return id;
  }

  async consumeRefreshToken(token: string): Promise<{
    tenantId: string;
    clientId: string;
    userId: string | null;
    scopes: string[];
    familyId: string;
  } | null> {
    const rows = await this.sql<
      {
        tenant_id: string;
        client_id: string;
        user_id: string | null;
        scopes: string;
        family_id: string;
        expires_at: Date;
        revoked: boolean;
      }[]
    >`select * from directory_refresh_tokens where id = ${token}`;
    const row = rows[0];
    if (!row || row.revoked || row.expires_at.getTime() < Date.now()) return null;
    await this.sql`update directory_refresh_tokens set revoked = true where id = ${token}`;
    return {
      tenantId: row.tenant_id,
      clientId: row.client_id,
      userId: row.user_id,
      scopes: row.scopes.split(/\s+/).filter(Boolean),
      familyId: row.family_id,
    };
  }

  async createDeviceCode(input: {
    tenantId: string;
    clientId: string;
    scopes: string[];
  }): Promise<{ deviceCode: string; userCode: string; expiresIn: number; interval: number }> {
    const deviceCode = randomBytes(32).toString("base64url");
    const userCode = randomBytes(3).toString("hex").toUpperCase();
    const expiresIn = 900;
    await this.sql`
      insert into directory_device_codes (
        device_code, user_code, tenant_id, client_id, scopes, expires_at, interval_seconds
      ) values (
        ${deviceCode}, ${userCode}, ${input.tenantId}, ${input.clientId},
        ${input.scopes.join(" ")}, ${new Date(Date.now() + expiresIn * 1000)}, 5
      )
    `;
    return { deviceCode, userCode, expiresIn, interval: 5 };
  }

  async getDeviceByUserCode(userCode: string) {
    const rows = await this.sql<
      {
        device_code: string;
        user_code: string;
        tenant_id: string;
        client_id: string;
        scopes: string;
        expires_at: Date;
        approved_user_id: string | null;
      }[]
    >`select * from directory_device_codes where user_code = ${userCode.toUpperCase()}`;
    return rows[0] ?? null;
  }

  async approveDeviceCode(userCode: string, userId: string): Promise<boolean> {
    const rows = await this.sql`
      update directory_device_codes
      set approved_user_id = ${userId}
      where user_code = ${userCode.toUpperCase()} and expires_at > now()
      returning device_code
    `;
    return rows.length > 0;
  }

  async pollDeviceCode(deviceCode: string) {
    const rows = await this.sql<
      {
        device_code: string;
        tenant_id: string;
        client_id: string;
        scopes: string;
        expires_at: Date;
        approved_user_id: string | null;
      }[]
    >`select * from directory_device_codes where device_code = ${deviceCode}`;
    return rows[0] ?? null;
  }
}

type DbUser = {
  id: string;
  tenant_id: string;
  user_principal_name: string;
  display_name: string;
  password_hash: string;
  job_title: string | null;
  department: string | null;
  account_enabled: boolean;
};

type DbGroup = {
  id: string;
  tenant_id: string;
  display_name: string;
  mail_nickname: string | null;
};

type DbApp = {
  app_id: string;
  tenant_id: string;
  display_name: string;
  public_client: boolean;
  client_secret_hash: string | null;
};

function mapUser(row: DbUser): DirectoryUser {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userPrincipalName: row.user_principal_name,
    displayName: row.display_name,
    jobTitle: row.job_title,
    department: row.department,
    accountEnabled: row.account_enabled,
  };
}

function mapGroup(row: DbGroup): DirectoryGroup {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    mailNickname: row.mail_nickname,
  };
}

function mapApp(
  row: DbApp,
  redirectUris: string[],
  appRoles: string[],
  assignedRoles: string[],
): DirectoryApp {
  return {
    appId: row.app_id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    publicClient: row.public_client,
    redirectUris,
    hasSecret: Boolean(row.client_secret_hash),
    appRoles,
    assignedRoles,
  };
}

export function createDirectoryStore(databaseUrl?: string): DirectoryStore {
  return new DirectoryStore(getDb(databaseUrl));
}
