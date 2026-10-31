/**
 * Pure rules for private user blocking.
 *
 * Kept free of `server-only` so the same rules can be unit-tested and reused
 * from any server module. Nothing here talks to the database.
 */

/**
 * Copy returned when a follow is refused. Deliberately identical to the generic
 * failure the follow button already shows, so a refused follow never discloses
 * that a block exists.
 */
export const FOLLOW_REFUSED_MESSAGE = 'Unable to update follow state. Please try again.';

/**
 * Drops questions whose author has blocked the viewer.
 *
 * Applied in trusted server code before any row reaches React, so a blocked
 * author never appears in a feed, a discovery queue or a profile's questions.
 * An empty block set returns the input untouched.
 */
export function excludeBlockedAuthors<T extends { author_id: string }>(
  rows: T[],
  blockedAuthorIds: Iterable<string>,
): T[] {
  const blocked = new Set(blockedAuthorIds);
  if (blocked.size === 0) return rows;
  return rows.filter((row) => !blocked.has(row.author_id));
}

/** True when this author's questions must be withheld from the viewer. */
export function isAuthorBlocked(authorId: string, blockedAuthorIds: Iterable<string>): boolean {
  return new Set(blockedAuthorIds).has(authorId);
}

/**
 * Whether one profile may block another. Blocking yourself is refused by a
 * database CHECK as well, so this only exists to give the API a 400 rather than
 * a database error.
 */
export function canBlock(blockerId: string, blockedId: string): boolean {
  return Boolean(blockerId && blockedId) && blockerId !== blockedId;
}
