'use client';

import { useState } from 'react';
import Link from 'next/link';
import posthog from 'posthog-js';
import { useAuth } from '@/components/AuthProvider';
import { isAnalyticsEnabled } from '@/lib/analytics';

export default function AuthStatus() {
  const { session, supabase } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setErrorMessage('');

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Sign-out is followed by a full navigation, which remounts the app with a
      // fresh identity ref - so the ref-based reset in AnalyticsIdentity would
      // never see this transition. Clear the stored identity here instead, so the
      // next person on this browser does not inherit the signed-out account's
      // PostHog person.
      try {
        if (isAnalyticsEnabled()) posthog.reset();
      } catch {
        // Analytics is optional; it must never block signing out.
      }

      // A full navigation discards authenticated server payloads and prefetched routes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Sign-out must discard the authenticated client cache.
      window.location.assign('/');
    } catch {
      setErrorMessage('Unable to sign out. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!session) {
    return (
      <Link href="/login" className="button button-primary text-sm">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex max-w-[14rem] flex-wrap items-center gap-3">
      <span className="hidden truncate text-xs text-zinc-500 sm:block">{session.user.email}</span>
      <button
        className="min-h-0 whitespace-nowrap border-0 bg-transparent px-0 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-100 disabled:opacity-60"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? 'Signing out...' : 'Sign out'}
      </button>
      <span role="status" className="text-xs text-zinc-400">{errorMessage}</span>
    </div>
  );
}
