'use client';

import AuthProvider from '@/components/AuthProvider';

type Props = {
  children: React.ReactNode;
};

export default function SupabaseProvider({ children }: Props) {
  return <AuthProvider>{children}</AuthProvider>;
}
