/**
 * Server-side reads and writes for private user blocks.
 *
 * Everything runs through the service-role client, so the caller must always be
 * an authenticated server operation that has already resolved the viewer's own
 * id. Nothing in here ever returns a block the viewer did not create.
 */

import 'server-only';
import { supabaseAdmin } from './supabase-admin';

export type BlockedProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

/** Has `blockerId` blocked `viewerId`? Only ever answers about the viewer. */
export async function hasBlocked(blockerId: string, viewerId: string): Promise<boolean> {
  if (!blockerId || !viewerId || blockerId === viewerId) return false;

  const { data, error } = await supabaseAdmin
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', viewerId)
    .maybeSingle();

  // Throwing is deliberate: failing open would serve content the viewer is not
  // allowed to see, so a real lookup failure must surface rather than leak.
  if (error) throw new Error('Unable to load this profile.');
  return Boolean(data);
}

/**
 * Everyone who has blocked the viewer. Their questions are withheld from every
 * surface the viewer can reach.
 *
 * Callers must fail closed if this throws: an unfiltered list cannot be served.
 */
export async function loadAuthorsBlockedByViewer(viewerId: string): Promise<string[]> {
  if (!viewerId) return [];

  const { data, error } = await supabaseAdmin
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocked_id', viewerId);

  if (error) throw new Error('Unable to load question visibility.');
  return (data ?? []).map((row) => row.blocker_id);
}

/**
 * The viewer's own block list, newest first, for the private section on their
 * profile. Reads rows where the viewer is the blocker and nothing else.
 */
export async function loadMyBlockedProfiles(blockerId: string): Promise<BlockedProfile[]> {
  const { data, error } = await supabaseAdmin
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Unable to load your blocked users.');

  const ids = (data ?? []).map((row) => row.blocked_id);
  if (ids.length === 0) return [];

  const { data: profilesData, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name')
    .in('id', ids);

  if (profilesError) throw new Error('Unable to load your blocked users.');

  const byId = new Map(
    ((profilesData ?? []) as BlockedProfile[]).map((profile) => [profile.id, profile]),
  );
  return ids.map((id) => byId.get(id)).filter((profile): profile is BlockedProfile => Boolean(profile));
}

/** Records one block. The database trigger removes the blocked user's follow. */
export async function createBlock(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('user_blocks').upsert(
    { blocker_id: blockerId, blocked_id: blockedId },
    { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
  );

  // 23505 simply means the block already exists, which is a no-op for the caller.
  if (error && error.code !== '23505') throw new Error('Unable to block this user right now.');
}

/** Removes one block. Never recreates the follow the trigger deleted. */
export async function removeBlock(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) throw new Error('Unable to unblock this user right now.');
}

/**
 * Whether `authorId`'s questions must be withheld from `viewerId`.
 *
 * Never throws: a lookup failure fails closed, and callers map `true` onto the
 * exact response they already give for a record that does not exist, so a block
 * is not distinguishable from a missing row.
 */
export async function withholdsQuestionsFrom(
  authorId: string,
  viewerId: string | null | undefined,
): Promise<boolean> {
  if (!viewerId || !authorId || authorId === viewerId) return false;

  try {
    return await hasBlocked(authorId, viewerId);
  } catch {
    return true;
  }
}
