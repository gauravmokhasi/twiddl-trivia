import { timingSafeEqual } from 'node:crypto';

/**
 * Shared guard for the daily cron endpoints. Vercel sends `CRON_SECRET` as a
 * bearer token; anything else is refused before any work happens.
 *
 * Comparison is constant time so a probe cannot learn the secret one byte at a
 * time. A missing secret refuses everything rather than opening the endpoint.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const actual = Buffer.from(authorization, 'utf8');

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
