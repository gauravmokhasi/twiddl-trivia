/**
 * Shared allow-list for post-authentication redirects.
 *
 * Only a plain path on this site is ever accepted. `new URL()` treats
 * `//evil.com` as protocol relative and browsers normalise a backslash to a
 * slash, so both of those forms are rejected rather than rewritten.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || /^\/[/\\]/.test(raw)) return fallback;
  return raw;
}

/** The one destination re-engagement links are ever allowed to reach. */
export function questionPath(questionId: string): string {
  return `/questions/${encodeURIComponent(questionId)}`;
}
