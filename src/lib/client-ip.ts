/**
 * A best-effort client identifier used for per-IP rate limiting.
 *
 * Reads the first hop from `x-forwarded-for`, falls back to `x-real-ip`,
 * and finally to the literal string `"unknown"`. Never treated as a real
 * identity — only as a throttle bucket key.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}
