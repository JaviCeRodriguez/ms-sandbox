import type { TenantStore } from "./tenants.js";

export type TenantSeedDoc = {
  tenants?: Array<{
    id: string;
    displayName: string;
    defaultDomain?: string | null;
  }>;
};

export async function applyTenantSeed(
  store: TenantStore,
  doc: TenantSeedDoc,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const tenant of doc.tenants ?? []) {
    const existing = await store.get(tenant.id);
    if (existing) {
      await store.update(tenant.id, {
        displayName: tenant.displayName,
        defaultDomain: tenant.defaultDomain ?? null,
      });
      updated += 1;
    } else {
      await store.create({
        id: tenant.id,
        displayName: tenant.displayName,
        defaultDomain: tenant.defaultDomain ?? null,
      });
      created += 1;
    }
  }
  return { created, updated };
}
