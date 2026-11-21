process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ORIGIN = "https://localhost:8443";

async function show(label, res) {
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 300));
  if (!res.ok && res.status !== 404) throw new Error(`${label} failed`);
}

const health = await fetch(`${ORIGIN}/health`);
await show("health", health);

const tenants = await fetch(`${ORIGIN}/admin/v1/tenants`);
await show("tenants", tenants);

const odata = await fetch(
  `${ORIGIN}/v1.0/devPlaceholder?$select=name&$filter=startswith(name,'a')&$top=2&$count=true`,
);
await show("odata", odata);

const batch = await fetch(`${ORIGIN}/v1.0/$batch`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    requests: [
      { id: "1", method: "GET", url: "/v1.0/devPlaceholder?$top=1" },
      { id: "2", method: "GET", url: "/v1.0/missing" },
    ],
  }),
});
await show("batch", batch);

const fault = await fetch(`${ORIGIN}/admin/v1/faults`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    pathGlob: "/v1.0/devPlaceholder",
    status: 429,
    retryAfter: 1,
    oneShot: true,
  }),
});
await show("fault-create", fault);

const injected = await fetch(`${ORIGIN}/v1.0/devPlaceholder`);
console.log("fault-hit", injected.status, injected.headers.get("retry-after"), await injected.text());
if (injected.status !== 429) throw new Error("expected 429 from fault");

const after = await fetch(`${ORIGIN}/v1.0/devPlaceholder`);
await show("fault-consumed", after);
if (after.status !== 200) throw new Error("expected one-shot fault to clear");

const seed = await fetch(`${ORIGIN}/admin/v1/seeds:apply`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tenants: [
      {
        id: "22222222-2222-2222-2222-222222222222",
        displayName: "Fabrikam",
        defaultDomain: "fabrikam.test",
      },
    ],
  }),
});
await show("seed", seed);

const requests = await fetch(`${ORIGIN}/admin/v1/requests?top=5`);
await show("requests", requests);

console.log("STAGE0 SMOKE OK");
