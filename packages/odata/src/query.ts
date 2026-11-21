export type ODataQuery = {
  select?: string[];
  filter?: string;
  top?: number;
  skip?: number;
  orderby?: { field: string; desc: boolean }[];
  count?: boolean;
};

export function parseODataQuery(searchParams: URLSearchParams): ODataQuery {
  const select = searchParams.get("$select")?.split(",").map((s) => s.trim()).filter(Boolean);
  const filter = searchParams.get("$filter") ?? undefined;
  const topRaw = searchParams.get("$top");
  const skipRaw = searchParams.get("$skip");
  const orderbyRaw = searchParams.get("$orderby");
  const count = searchParams.get("$count") === "true";

  const orderby = orderbyRaw
    ? orderbyRaw.split(",").map((part) => {
        const [field, dir] = part.trim().split(/\s+/);
        return { field: field!, desc: (dir ?? "asc").toLowerCase() === "desc" };
      })
    : undefined;

  return {
    select: select?.length ? select : undefined,
    filter,
    top: topRaw ? Number(topRaw) : undefined,
    skip: skipRaw ? Number(skipRaw) : undefined,
    orderby,
    count,
  };
}

/** Minimal in-memory OData for Stage 0 placeholder resources. */
export function applyOData<T extends Record<string, unknown>>(
  items: T[],
  query: ODataQuery,
  opts?: { context?: string; baseUrl?: string },
): Record<string, unknown> {
  let rows = [...items];

  if (query.filter) {
    rows = rows.filter((row) => matchSimpleFilter(row, query.filter!));
  }

  if (query.orderby?.length) {
    for (const clause of [...query.orderby].reverse()) {
      rows.sort((a, b) => {
        const av = a[clause.field];
        const bv = b[clause.field];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : 1;
        return clause.desc ? -cmp : cmp;
      });
    }
  }

  const total = rows.length;
  const skip = query.skip ?? 0;
  const top = query.top ?? rows.length;
  const page = rows.slice(skip, skip + top);

  const value = query.select?.length
    ? page.map((row) => {
        const picked: Record<string, unknown> = {};
        for (const key of query.select!) {
          if (key in row) picked[key] = row[key];
        }
        return picked;
      })
    : page;

  const body: Record<string, unknown> = { value };
  if (opts?.context) body["@odata.context"] = opts.context;
  if (query.count) body["@odata.count"] = total;

  if (opts?.baseUrl && skip + top < total) {
    const next = new URL(opts.baseUrl);
    next.searchParams.set("$skip", String(skip + top));
    if (query.top != null) next.searchParams.set("$top", String(query.top));
    if (query.select) next.searchParams.set("$select", query.select.join(","));
    if (query.filter) next.searchParams.set("$filter", query.filter);
    if (query.count) next.searchParams.set("$count", "true");
    body["@odata.nextLink"] = next.toString();
  }

  return body;
}

/** Supports: field eq 'value' | field eq null | startswith(field,'x') — and combinations with and. */
function matchSimpleFilter(row: Record<string, unknown>, filter: string): boolean {
  const parts = filter.split(/\s+and\s+/i).map((p) => p.trim());
  return parts.every((part) => {
    const starts = /^startswith\((\w+),'([^']*)'\)$/i.exec(part);
    if (starts) {
      const [, field, needle] = starts;
      return String(row[field!] ?? "").startsWith(needle!);
    }
    const eqNull = /^(\w+)\s+eq\s+null$/i.exec(part);
    if (eqNull) return row[eqNull[1]!] == null;
    const eq = /^(\w+)\s+eq\s+'([^']*)'$/i.exec(part);
    if (eq) return String(row[eq[1]!] ?? "") === eq[2];
    return true;
  });
}
