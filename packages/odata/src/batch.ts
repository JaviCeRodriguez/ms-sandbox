export type BatchRequest = {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  dependsOn?: string[];
};

export type BatchResponseItem = {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Executes Graph-style JSON batch (max 20). Serial when dependsOn is present;
 * otherwise parallel. `dispatch` receives a relative url like `/v1.0/users`.
 */
export async function handleJsonBatch(
  requests: BatchRequest[] | undefined,
  dispatch: (req: BatchRequest) => Promise<BatchResponseItem>,
): Promise<{ responses: BatchResponseItem[] }> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return { responses: [] };
  }
  if (requests.length > 20) {
    throw new Error("Batch limited to 20 requests");
  }

  const pending = new Map(requests.map((r) => [r.id, r]));
  const done = new Map<string, BatchResponseItem>();
  const responses: BatchResponseItem[] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((r) =>
      (r.dependsOn ?? []).every((id) => done.has(id)),
    );
    if (ready.length === 0) {
      throw new Error("Batch dependency cycle or missing dependsOn target");
    }

    const chunk = await Promise.all(ready.map((r) => dispatch(r)));
    for (const item of chunk) {
      done.set(item.id, item);
      responses.push(item);
      pending.delete(item.id);
    }
  }

  // Preserve request order in the response list.
  const byId = new Map(responses.map((r) => [r.id, r]));
  return { responses: requests.map((r) => byId.get(r.id)!).filter(Boolean) };
}
