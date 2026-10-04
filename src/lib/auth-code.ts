import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Exchanges a Supabase auth code for a session, server-side (PKCE).
 *
 * Sign-in links normally land on /auth/callback, but if that URL is not in Supabase's redirect
 * allow-list the link falls back to the Site URL instead. Exchanging the code wherever it arrives is
 * what makes the first click sign the user in rather than the second.
 */
export async function exchangeAuthCode(code: string): Promise<boolean> {
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Logged without any secret so a failed first click can be diagnosed from server logs. A
      // "code verifier" message means the browser did not send the PKCE cookie (different browser or
      // an in-app web view); "invalid" or "already used" means the code had been consumed already.
      console.warn(`[auth] code exchange failed: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[auth] code exchange threw: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  }
}