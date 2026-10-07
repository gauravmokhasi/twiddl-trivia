/**
 * Tiny in-memory per-key rate limiter for API routes. Single-instance safe
 * (good enough for dev and single-region deploys); for multi-instance
 * production use a shared store (e.g. Vercel KV / Upstash) behind this API.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

/** Prune expired buckets so the map cannot grow forever. Called on each check. */
function prune() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  if (buckets.size > 10000) buckets.clear();
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  prune();
  return checkRateLimit(key, limit, windowMs);
}
