/** In-process request latency metrics (Stage 0 telemetry). */
const samples: number[] = [];
let requestCount = 0;

export function recordLatency(ms: number) {
  requestCount += 1;
  samples.push(ms);
  if (samples.length > 2000) samples.splice(0, samples.length - 2000);
}

export function getMetrics() {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 =
    sorted.length === 0
      ? 0
      : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  return {
    requestCount,
    sampleSize: sorted.length,
    latencyMs: {
      p50: sorted.length ? sorted[Math.floor(sorted.length * 0.5)]! : 0,
      p95,
      max: sorted.length ? sorted[sorted.length - 1]! : 0,
    },
  };
}
