import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "./db.js";
import { getDb } from "./db.js";
import type { TenantStore } from "./tenants.js";
import { applyTenantSeed } from "./seeds.js";
import type { FaultStore } from "./faults.js";

export type SnapshotMeta = {
  id: string;
  name: string;
  createdAt: string;
  path: string;
};

export type SnapshotPayload = {
  version: 1;
  name: string;
  savedAt: string;
  tenants: Array<{
    id: string;
    displayName: string;
    defaultDomain: string | null;
  }>;
  faults: Array<{
    pathGlob: string;
    method: string | null;
    status: number;
    retryAfter: number | null;
    oneShot: boolean;
    active: boolean;
  }>;
};

export class SnapshotStore {
  constructor(
    private readonly sql: Sql,
    private readonly snapshotsDir: string,
  ) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  async list(): Promise<SnapshotMeta[]> {
    const rows = await this.sql<
      { id: string; name: string; created_at: Date; file_path: string }[]
    >`select id, name, created_at, file_path from snapshot_metadata order by created_at desc`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at.toISOString(),
      path: r.file_path,
    }));
  }

  async save(
    name: string,
    tenants: TenantStore,
    faults: FaultStore,
  ): Promise<SnapshotMeta> {
    const id = randomUUID();
    const filePath = join(this.snapshotsDir, `${name}.json`);
    const payload: SnapshotPayload = {
      version: 1,
      name,
      savedAt: new Date().toISOString(),
      tenants: (await tenants.list()).map((t) => ({
        id: t.id,
        displayName: t.displayName,
        defaultDomain: t.defaultDomain,
      })),
      faults: (await faults.list()).map((f) => ({
        pathGlob: f.pathGlob,
        method: f.method,
        status: f.status,
        retryAfter: f.retryAfter,
        oneShot: f.oneShot,
        active: f.active,
      })),
    };
    writeFileSync(filePath, JSON.stringify(payload, null, 2));
    const rows = await this.sql<{ id: string; name: string; created_at: Date; file_path: string }[]>`
      insert into snapshot_metadata (id, name, file_path)
      values (${id}, ${name}, ${filePath})
      on conflict (name) do update set file_path = excluded.file_path, created_at = now()
      returning id, name, created_at, file_path
    `;
    return {
      id: rows[0]!.id,
      name: rows[0]!.name,
      createdAt: rows[0]!.created_at.toISOString(),
      path: rows[0]!.file_path,
    };
  }

  async restore(
    name: string,
    tenants: TenantStore,
    faults: FaultStore,
  ): Promise<SnapshotPayload> {
    const filePath = join(this.snapshotsDir, `${name}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Snapshot not found: ${name}`);
    }
    const payload = JSON.parse(readFileSync(filePath, "utf8")) as SnapshotPayload;
    await this.resetPlatform(tenants, faults, { reseed: false });
    await applyTenantSeed(tenants, { tenants: payload.tenants });
    for (const f of payload.faults) {
      if (!f.active) continue;
      await faults.create({
        pathGlob: f.pathGlob,
        method: f.method,
        status: f.status,
        retryAfter: f.retryAfter,
        oneShot: f.oneShot,
      });
    }
    return payload;
  }

  /** Clears tenants, faults, request logs. Optionally reseed Contoso. */
  async resetPlatform(
    tenants: TenantStore,
    faults: FaultStore,
    opts: { reseed?: boolean; contoso?: { id: string; displayName: string; defaultDomain: string } } = {},
  ): Promise<void> {
    await this.sql`delete from request_logs`;
    await this.sql`delete from fault_rules`;
    await this.sql`delete from audit_events`;
    await this.sql`delete from tenants`;
    if (opts.reseed !== false) {
      const contoso = opts.contoso ?? {
        id: "11111111-1111-1111-1111-111111111111",
        displayName: "Contoso Ltd",
        defaultDomain: "contoso.test",
      };
      await applyTenantSeed(tenants, { tenants: [contoso] });
    }
    // silence unused
    void faults;
  }

  async removeFileIfOrphan(name: string): Promise<void> {
    const filePath = join(this.snapshotsDir, `${name}.json`);
    if (existsSync(filePath) && !readdirSync(this.snapshotsDir).includes(`${name}.json`)) {
      unlinkSync(filePath);
    }
  }
}

export function createSnapshotStore(snapshotsDir: string, databaseUrl?: string): SnapshotStore {
  return new SnapshotStore(getDb(databaseUrl), snapshotsDir);
}
