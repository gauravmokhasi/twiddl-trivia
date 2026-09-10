'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase-client';
import type { Database } from '@/lib/database.types';

type AuthContextValue = {
  session: Session | null;
  supabase: SupabaseClient<Database>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  supabase: supabaseBrowser,
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const { data: subscription } = supabaseBrowser.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ session, supabase: supabaseBrowser }}>{children}</AuthContext.Provider>;
}
