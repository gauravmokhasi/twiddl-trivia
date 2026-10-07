'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

/** Reconcile a browser session without delaying the public landing page's HTML. */
export default function RefreshAuthenticatedLanding() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;
  useEffect(() => {
    if (!isLoading && userId) router.refresh();
  }, [isLoading, userId, router]);
  return null;
}
