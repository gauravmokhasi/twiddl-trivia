'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';

const ACTIVITY_WRITE_THROTTLE_MS = 10_000;

/**
 * Records that this signed-in session is genuinely being used.
 *
 * It fires only when someone lands on a page or brings the tab back to the
 * foreground, never on a timer, so background polling and idle tabs do not
 * count as activity. Without a session nothing is sent at all, which is what
 * keeps crawlers and prefetches out of the picture; the server re-verifies the
 * JWT and applies its own throttle regardless.
 */
export default function ActivityTracker() {
  const { session, isLoading } = useAuth();
  const lastSentAt = useRef(0);
  const userId = session?.user?.id;

  useEffect(() => {
    if (isLoading || !userId) return;

    const heartbeat = () => {
      const now = Date.now();
      if (now - lastSentAt.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastSentAt.current = now;

      fetch('/api/activity', { method: 'POST', keepalive: true }).catch(() => {
        // Activity is best effort; a failed heartbeat must never disturb the page.
      });
    };

    heartbeat();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [userId, isLoading]);

  return null;
}
