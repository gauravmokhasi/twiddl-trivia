/**
 * Rules for rendering a follower/following list.
 *
 * Twiddl has one listing flag, `profiles.is_public`. The owner of a profile may
 * see their own lists in full, including unlisted profiles. Anybody else sees
 * only the listed profiles, plus a bare count of how many were withheld - never
 * their names, handles or ids.
 *
 * These helpers only decide what to render. Fetching is done server-side (see
 * `src/app/profile/[username]/page.tsx`), which is what keeps unlisted rows out
 * of the browser rather than merely hiding them in the UI.
 */

export type FollowListSummary = {
  /** Profiles actually listed on the page, plus the withheld ones. */
  total: number;
  visibleCount: number;
  hiddenCount: number;
  /** "4 unlisted profiles", or null when nothing was withheld. */
  unlistedLabel: string | null;
  /** True when the list has nobody in it at all. */
  isEmpty: boolean;
};

/**
 * The aggregate line shown to somebody who is not the profile owner.
 *
 * Returns null when nothing is hidden so the line is simply not rendered, and
 * uses the singular for a single withheld profile.
 */
export function describeUnlistedCount(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return `${count} unlisted profile${count === 1 ? '' : 's'}`;
}

/**
 * Turns the two numbers a viewer is allowed to know into everything the list
 * card needs. Counts are clamped so a bad count can never produce a negative
 * total or a stray label.
 */
export function summarizeFollowList(input: {
  visibleCount: number;
  hiddenCount: number;
}): FollowListSummary {
  const visibleCount = Math.max(0, Math.trunc(input.visibleCount));
  const hiddenCount = Math.max(0, Math.trunc(input.hiddenCount));
  const total = visibleCount + hiddenCount;

  return {
    total,
    visibleCount,
    hiddenCount,
    unlistedLabel: describeUnlistedCount(hiddenCount),
    isEmpty: total === 0,
  };
}
