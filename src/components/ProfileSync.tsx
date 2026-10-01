'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function ProfileSync() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Sync once per user. Depending on the id rather than the session object avoids a repeat POST on
    // every token refresh, and the ref makes it resilient to React Strict Mode double-invoking effects.
    if (!userId || syncedUserId.current === userId) {
      return;
    }

    syncedUserId.current = userId;

    const syncProfile = async () => {
      await fetch('/api/profile-sync', {
        method: 'POST',
      });
    };

    syncProfile();
  }, [userId]);

  return null;
}
