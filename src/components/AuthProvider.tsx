'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase-client';
import type { Database } from '@/lib/database.types';

type AuthContextValue = {
  session: Session | null;
  supabase: SupabaseClient<Database>;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  supabase: supabaseBrowser,
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ session, supabase: supabaseBrowser, isLoading }}>{children}</AuthContext.Provider>;
}
