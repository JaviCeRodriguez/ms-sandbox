import { createMiddleware } from "hono/factory";
import { graphError } from "@ms-sandbox/odata";
import type { FaultStore, RequestLogStore } from "@ms-sandbox/core";

/** Request inspector + fault injection (Stage 0). */
export function observabilityMiddleware(opts: {
  requests: RequestLogStore | null;
  faults: FaultStore | null;
}) {
  return createMiddleware(async (c, next) => {
    const started = Date.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    if (opts.faults && !path.startsWith("/admin/v1/faults") && !path.startsWith("/health")) {
      const fault = await opts.faults.match(method, path);
      if (fault) {
        if (fault.oneShot) await opts.faults.deactivate(fault.id);
        const headers: Record<string, string> = {};
        if (fault.retryAfter != null) headers["Retry-After"] = String(fault.retryAfter);
        const body = graphError(
          fault.status === 429 ? "activityLimitReached" : "UnknownError",
          `Injected fault ${fault.status} for ${path}`,
        );
        if (opts.requests) {
          await opts.requests.append({
            method,
            path,
            status: fault.status,
            durationMs: Date.now() - started,
          });
        }
        return new Response(JSON.stringify(body), {
          status: fault.status,
          headers: { "Content-Type": "application/json", ...headers },
        });
      }
    }

    await next();

    if (opts.requests) {
      await opts.requests.append({
        method,
        path,
        status: c.res.status,
        durationMs: Date.now() - started,
      });
    }
  });
}
