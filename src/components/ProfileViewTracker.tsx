'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { isAnalyticsEnabled } from '@/lib/analytics';

type Props = {
  profileUserId: string;
  isOwnProfile: boolean;
};

/**
 * Emits `profile_viewed` once per actual visit to a rendered profile.
 *
 * The guard is a ref holding the last profile ID this instance reported:
 *
 * - React Strict Mode replays the effect, but the ref is already set, so the
 *   replay is swallowed.
 * - Parent re-renders do not re-run the effect (the deps do not change), and
 *   nothing listens to tab visibility, so switching tabs cannot re-emit.
 * - The component unmounts when you leave, so a later genuine visit mounts a
 *   fresh instance and reports again.
 *
 * It renders null and only acts in an effect, so server rendering alone never
 * counts - the profile has to actually mount, and the document has to be
 * visible.
 */
export default function ProfileViewTracker({ profileUserId, isOwnProfile }: Props) {
  const emittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (emittedFor.current === profileUserId) return;
    // Never report a page the browser says is hidden.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    emittedFor.current = profileUserId;
    try {
      posthog.capture('profile_viewed', {
        profile_user_id: profileUserId,
        is_own_profile: isOwnProfile,
      });
    } catch {
      // Reporting a view is optional; a failure must not break the page.
    }
  }, [profileUserId, isOwnProfile]);

  return null;
}
