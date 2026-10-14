import { NextResponse } from "next/server";

// Minimal in-memory sliding-window limiter, keyed by bucket + client IP. Per-process only
// (fine for one server instance; a multi-instance deploy would need a shared store like Redis).
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Returns a 429 response if this client exceeded `max` calls to `bucket` in `windowMs`, else null. */
export function rateLimit(req: Request, bucket: string, max: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
    hits.set(key, recent);
    return NextResponse.json(
      { status: "error", error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map can't grow without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return null;
}
