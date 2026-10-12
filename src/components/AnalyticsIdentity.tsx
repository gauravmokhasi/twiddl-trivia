'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { useAuth } from '@/components/AuthProvider';
import { isAnalyticsEnabled, nextIdentityAction } from '@/lib/analytics';

/**
 * Keeps PostHog's identity in step with the Supabase session.
 *
 * Only the Supabase `user.id` is ever used, both as the distinct ID here and
 * for the server-side events, so browser and server activity land on the same
 * person. No email, username, display name, bio or other profile field is sent
 * as a person property.
 *
 * The identified ID lives in a ref rather than state: identity is bookkeeping,
 * not UI, and a ref means a re-render (or a token refresh) re-runs the effect
 * without re-identifying, and Strict Mode's replayed effect cannot identify
 * twice either.
 */
export default function AnalyticsIdentity() {
  const { session, isLoading } = useAuth();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    const userId = session?.user?.id ?? null;
    const action = nextIdentityAction({
      isLoading,
      userId,
      identifiedUserId: identifiedUserId.current,
    });

    try {
      if (action === 'identify' && userId) {
        identifiedUserId.current = userId;
        // Deliberately no person properties.
        posthog.identify(userId);
      } else if (action === 'reset_then_identify' && userId) {
        // A different account signed in: drop the previous person first so the
        // new one never inherits their activity.
        posthog.reset();
        identifiedUserId.current = userId;
        posthog.identify(userId);
      } else if (action === 'reset') {
        identifiedUserId.current = null;
        posthog.reset();
      }
    } catch {
      // Identity is best effort; it must never disturb authentication.
    }
  }, [session, isLoading]);

  return null;
}
