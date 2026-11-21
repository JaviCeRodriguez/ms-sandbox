import { randomUUID } from "node:crypto";
import type { Sql } from "./db.js";
import { getDb } from "./db.js";

export type TenantRecord = {
  id: string;
  displayName: string;
  defaultDomain: string | null;
  createdAt: string;
};

export class TenantStore {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<TenantRecord[]> {
    const rows = await this.sql<
      { id: string; display_name: string; default_domain: string | null; created_at: Date }[]
    >`select id, display_name, default_domain, created_at from tenants order by created_at asc`;
    return rows.map(mapTenant);
  }

  async get(id: string): Promise<TenantRecord | null> {
    const rows = await this.sql<
      { id: string; display_name: string; default_domain: string | null; created_at: Date }[]
    >`select id, display_name, default_domain, created_at from tenants where id = ${id}`;
    return rows[0] ? mapTenant(rows[0]) : null;
  }

  async create(input: {
    id?: string;
    displayName: string;
    defaultDomain?: string | null;
  }): Promise<TenantRecord> {
    const id = input.id ?? randomUUID();
    const rows = await this.sql<
      { id: string; display_name: string; default_domain: string | null; created_at: Date }[]
    >`
      insert into tenants (id, display_name, default_domain)
      values (${id}, ${input.displayName}, ${input.defaultDomain ?? null})
      returning id, display_name, default_domain, created_at
    `;
    return mapTenant(rows[0]!);
  }

  async update(
    id: string,
    patch: { displayName?: string; defaultDomain?: string | null },
  ): Promise<TenantRecord | null> {
    const current = await this.get(id);
    if (!current) return null;
    const displayName = patch.displayName ?? current.displayName;
    const defaultDomain =
      patch.defaultDomain !== undefined ? patch.defaultDomain : current.defaultDomain;
    const rows = await this.sql<
      { id: string; display_name: string; default_domain: string | null; created_at: Date }[]
    >`
      update tenants
      set display_name = ${displayName}, default_domain = ${defaultDomain}
      where id = ${id}
      returning id, display_name, default_domain, created_at
    `;
    return rows[0] ? mapTenant(rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.sql`delete from tenants where id = ${id} returning id`;
    return rows.length > 0;
  }
}

function mapTenant(row: {
  id: string;
  display_name: string;
  default_domain: string | null;
  created_at: Date;
}): TenantRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    defaultDomain: row.default_domain,
    createdAt: row.created_at.toISOString(),
  };
}

export function createTenantStore(databaseUrl?: string): TenantStore {
  return new TenantStore(getDb(databaseUrl));
}
