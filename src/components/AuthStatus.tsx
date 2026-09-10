'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

export default function AuthStatus() {
  const { session, supabase } = useAuth();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return (
      <Link href="/login" className="button button-primary">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-slate-600">Signed in as {session.user.email}</span>
      <button className="button button-secondary" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
