import { randomUUID } from "node:crypto";
import type { Sql } from "./db.js";
import { getDb } from "./db.js";

export type FaultRule = {
  id: string;
  pathGlob: string;
  method: string | null;
  status: number;
  retryAfter: number | null;
  oneShot: boolean;
  active: boolean;
  createdAt: string;
};

export class FaultStore {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<FaultRule[]> {
    const rows = await this.sql<DbFault[]>`
      select id, path_glob, method, status, retry_after, one_shot, active, created_at
      from fault_rules
      order by created_at desc
    `;
    return rows.map(mapFault);
  }

  async create(input: {
    pathGlob: string;
    method?: string | null;
    status: number;
    retryAfter?: number | null;
    oneShot?: boolean;
  }): Promise<FaultRule> {
    const id = randomUUID();
    const rows = await this.sql<DbFault[]>`
      insert into fault_rules (id, path_glob, method, status, retry_after, one_shot, active)
      values (
        ${id},
        ${input.pathGlob},
        ${input.method ?? null},
        ${input.status},
        ${input.retryAfter ?? null},
        ${input.oneShot ?? true},
        true
      )
      returning id, path_glob, method, status, retry_after, one_shot, active, created_at
    `;
    return mapFault(rows[0]!);
  }

  async deactivate(id: string): Promise<void> {
    await this.sql`update fault_rules set active = false where id = ${id}`;
  }

  async match(method: string, path: string): Promise<FaultRule | null> {
    const active = (await this.list()).filter((f) => f.active);
    for (const fault of active) {
      if (fault.method && fault.method.toUpperCase() !== method.toUpperCase()) continue;
      if (matchGlob(fault.pathGlob, path)) return fault;
    }
    return null;
  }
}

type DbFault = {
  id: string;
  path_glob: string;
  method: string | null;
  status: number;
  retry_after: number | null;
  one_shot: boolean;
  active: boolean;
  created_at: Date;
};

function mapFault(row: DbFault): FaultRule {
  return {
    id: row.id,
    pathGlob: row.path_glob,
    method: row.method,
    status: row.status,
    retryAfter: row.retry_after,
    oneShot: row.one_shot,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  };
}

/** Supports exact path or prefix* suffix glob. */
export function matchGlob(glob: string, path: string): boolean {
  if (glob === path) return true;
  if (glob.endsWith("*")) return path.startsWith(glob.slice(0, -1));
  return false;
}

export function createFaultStore(databaseUrl?: string): FaultStore {
  return new FaultStore(getDb(databaseUrl));
}
