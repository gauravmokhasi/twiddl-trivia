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
      <Link href="/login" className="button button-primary text-sm">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex max-w-[14rem] items-center gap-3">
      <span className="hidden truncate text-xs text-zinc-500 sm:block">{session.user.email}</span>
      <button className="min-h-0 whitespace-nowrap border-0 bg-transparent px-0 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-100" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
