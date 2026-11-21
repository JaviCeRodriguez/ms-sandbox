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
}
