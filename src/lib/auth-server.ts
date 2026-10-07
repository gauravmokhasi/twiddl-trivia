import type { User } from '@supabase/supabase-js';
import { createRouteSupabase, createServerSupabase } from '@/lib/supabase-server';

/**
 * Server-side auth: verifies the JWT with Supabase (getUser) rather than
 * trusting the session cookie (getSession). Use this in every API route and
 * server page that authorizes. Returns null for signed-out/invalid callers.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createRouteSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * Same check for server components, which share the server client.
 */
export async function getAuthenticatedServerUser(): Promise<User | null> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
