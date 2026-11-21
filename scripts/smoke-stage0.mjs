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
console.log("STAGE0 SMOKE OK");
