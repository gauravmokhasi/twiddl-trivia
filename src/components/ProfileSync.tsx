'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function ProfileSync() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const syncProfile = async () => {
      await fetch('/api/profile-sync', {
        method: 'POST',
      });
    };

    syncProfile();
  }, [session]);

  return null;
}
