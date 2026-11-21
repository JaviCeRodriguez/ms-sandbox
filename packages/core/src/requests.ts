import { randomUUID } from "node:crypto";
import type { Sql } from "./db.js";
import { getDb } from "./db.js";

export type RequestLogRecord = {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  tenantId: string | null;
  createdAt: string;
};

export class RequestLogStore {
  constructor(private readonly sql: Sql) {}

  async append(input: {
    method: string;
    path: string;
    status: number;
    durationMs: number;
    tenantId?: string | null;
  }): Promise<RequestLogRecord> {
    const id = randomUUID();
    const rows = await this.sql<
      {
        id: string;
        method: string;
        path: string;
        status: number;
        duration_ms: number;
        tenant_id: string | null;
        created_at: Date;
      }[]
    >`
      insert into request_logs (id, method, path, status, duration_ms, tenant_id)
      values (
        ${id},
        ${input.method},
        ${input.path},
        ${input.status},
        ${input.durationMs},
        ${input.tenantId ?? null}
      )
      returning id, method, path, status, duration_ms, tenant_id, created_at
    `;
    return mapRequest(rows[0]!);
  }

  async list(limit = 50): Promise<RequestLogRecord[]> {
    const rows = await this.sql<
      {
        id: string;
        method: string;
        path: string;
        status: number;
        duration_ms: number;
        tenant_id: string | null;
        created_at: Date;
      }[]
    >`
      select id, method, path, status, duration_ms, tenant_id, created_at
      from request_logs
      order by created_at desc
      limit ${limit}
    `;
    return rows.map(mapRequest);
  }
}

function mapRequest(row: {
  id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  tenant_id: string | null;
  created_at: Date;
}): RequestLogRecord {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    status: row.status,
    durationMs: row.duration_ms,
    tenantId: row.tenant_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function createRequestLogStore(databaseUrl?: string): RequestLogStore {
  return new RequestLogStore(getDb(databaseUrl));
}
