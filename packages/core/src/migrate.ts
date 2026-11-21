import { getDb } from "./db.js";

export async function migrate(databaseUrl?: string): Promise<void> {
  const sql = getDb(databaseUrl);
  await sql`
    create table if not exists tenants (
      id uuid primary key,
      display_name text not null,
      default_domain text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists audit_events (
      id uuid primary key,
      tenant_id uuid references tenants(id) on delete set null,
      kind text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists request_logs (
      id uuid primary key,
      method text not null,
      path text not null,
      status int not null,
      duration_ms int not null,
      tenant_id uuid,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists fault_rules (
      id uuid primary key,
      path_glob text not null,
      method text,
      status int not null,
      retry_after int,
      one_shot boolean not null default true,
      active boolean not null default true,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists snapshot_metadata (
      id uuid primary key,
      name text not null unique,
      file_path text not null,
      created_at timestamptz not null default now()
    )
  `;

  // --- Stage 1 directory ---
  await sql`
    create table if not exists directory_users (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      user_principal_name text not null,
      display_name text not null,
      password_hash text not null,
      job_title text,
      department text,
      account_enabled boolean not null default true,
      created_at timestamptz not null default now(),
      unique (tenant_id, user_principal_name)
    )
  `;
  await sql`
    create table if not exists directory_groups (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      display_name text not null,
      mail_nickname text,
      security_enabled boolean not null default true,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists directory_group_members (
      group_id uuid not null references directory_groups(id) on delete cascade,
      user_id uuid not null references directory_users(id) on delete cascade,
      primary key (group_id, user_id)
    )
  `;
  await sql`
    create table if not exists directory_applications (
      app_id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      display_name text not null,
      public_client boolean not null default true,
      client_secret_hash text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists directory_redirect_uris (
      app_id uuid not null references directory_applications(app_id) on delete cascade,
      redirect_uri text not null,
      primary key (app_id, redirect_uri)
    )
  `;
  await sql`
    create table if not exists directory_app_roles (
      id uuid primary key,
      app_id uuid not null references directory_applications(app_id) on delete cascade,
      value text not null,
      display_name text not null
    )
  `;
  await sql`
    create table if not exists directory_app_role_assignments (
      id uuid primary key,
      app_id uuid not null references directory_applications(app_id) on delete cascade,
      role_value text not null
    )
  `;
  await sql`
    create table if not exists directory_oauth2_grants (
      id uuid primary key,
      tenant_id uuid not null references tenants(id) on delete cascade,
      app_id uuid not null references directory_applications(app_id) on delete cascade,
      principal_upn text not null,
      scopes text not null,
      unique (tenant_id, app_id, principal_upn)
    )
  `;
  await sql`
    create table if not exists directory_refresh_tokens (
      id text primary key,
      tenant_id uuid not null,
      client_id uuid not null,
      user_id uuid,
      scopes text not null,
      expires_at timestamptz not null,
      family_id text not null,
      revoked boolean not null default false
    )
  `;
  await sql`
    create table if not exists directory_device_codes (
      device_code text primary key,
      user_code text not null unique,
      tenant_id uuid not null,
      client_id uuid not null,
      scopes text not null,
      expires_at timestamptz not null,
      approved_user_id uuid,
      interval_seconds int not null default 5
    )
  `;
}
