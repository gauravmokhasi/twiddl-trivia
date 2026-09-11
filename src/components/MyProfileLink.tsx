'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

export default function MyProfileLink() {
  const { session } = useAuth();

  if (!session?.user?.id) {
    return null;
  }

  return (
    <Link href="/profile" className="rounded-lg px-3 py-2 transition hover:bg-white/[0.06] hover:text-zinc-100">
      Profile
    </Link>
  );
}
