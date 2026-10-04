import { supabaseAdmin } from '@/lib/supabase-admin';
import { escapeLikePattern, normalizeIdentity } from '@/lib/profile-identity';

/**
 * Case-insensitive pre-check so the user gets a clear message before the database has to reject the
 * write.
 *
 * Targeted rather than exhaustive: the trigger on profiles stays the source of truth, so a race, or
 * a gap in this check, still cannot produce a duplicate. A lookup failure therefore fails open.
 */
async function identityExists(
  userId: string,
  column: 'username' | 'display_name',
  value: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .neq('id', userId)
    .ilike(column, escapeLikePattern(value))
    .limit(1);

  if (error) {
    console.warn(`[profileIdentity] ${column} lookup failed: ${error.message}`);
    return false;
  }

  return ((data ?? []) as { id: string }[]).length > 0;
}

/**
 * Returns why the candidate identity is unavailable, or null when it is free.
 *
 * A handle may not be another profile's handle, and a public name may not be another profile's
 * handle either, so each candidate value is checked against both columns.
 */
export async function findProfileIdentityConflict(
  userId: string,
  candidate: { username?: string | null; displayName?: string | null },
): Promise<string | null> {
  const handle = normalizeIdentity(candidate.username);
  const publicName = normalizeIdentity(candidate.displayName);

  if (handle) {
    if (await identityExists(userId, 'username', handle)) {
      return 'That username is already taken.';
    }

    if (await identityExists(userId, 'display_name', handle)) {
      return 'Another user already uses that as their public name, so pick a different username.';
    }
  }

  if (publicName && publicName !== handle) {
    if (await identityExists(userId, 'display_name', publicName)) {
      return 'That public name is already taken.';
    }

    if (await identityExists(userId, 'username', publicName)) {
      return 'Another user already has that as their username, so pick a different public name.';
    }
  }

  return null;
}