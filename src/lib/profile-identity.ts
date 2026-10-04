/**
 * Usernames and public names ("aliases") share one namespace: no two profiles may lay claim to the
 * same handle or public name, and a public name may not shadow someone else's handle.
 *
 * The database enforces the rule authoritatively with a trigger on profiles (see SUPABASE_SETUP.md).
 * Everything here exists so the app can normalise input, pre-check for a friendly message, and
 * recognise the database's rejection. It stays free of server-only imports so it can be unit tested.
 */

/** Raised by the profiles trigger, and shown to the user as-is. */
export const PROFILE_IDENTITY_CONFLICT_MESSAGE = 'That username or public name is already taken.';

/** Trim, collapse inner whitespace, then casefold. "  Maya  Kur " becomes "maya kur". */
export function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** True when two values claim the same identity slot. Blank values never match. */
export function identityValuesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftValue = normalizeIdentity(left);
  const rightValue = normalizeIdentity(right);

  return leftValue.length > 0 && leftValue === rightValue;
}

/**
 * Escape a literal for a PostgREST `ilike` pattern, so a name containing %, _ or * matches itself
 * instead of acting as a wildcard.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (character) => `\\${character}`);
}

/** Postgres unique_violation, from the trigger or from the case-insensitive handle index. */
export function isIdentityConflictError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;

  const message = error.message ?? '';

  if (message.includes(PROFILE_IDENTITY_CONFLICT_MESSAGE)) return true;

  return /duplicate key|unique constraint/i.test(message) && /username|display_name|public name/i.test(message);
}