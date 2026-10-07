/** Only the verified account owner is exempt from the daily question gate. */
export function isDailyQuestionRouteLocked(locked: boolean, viewerId: string | null, profileOwnerId?: string): boolean {
  return locked && !(viewerId && profileOwnerId && viewerId === profileOwnerId);
}

/** Feed leads to the composer while locked; account settings remain reachable. */
export function isNavigationLocked(locked: boolean, href: string): boolean {
  return locked && href !== '/' && href !== '/profile';
}
