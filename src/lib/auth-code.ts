import { createServerSupabase } from '@/lib/supabase-server';

/** The verification types this app will ever confirm from a token hash. */
export type AuthTokenHashType = 'magiclink' | 'recovery' | 'signup' | 'email_change';

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

/**
 * Confirms a single-use token hash server-side and writes the session cookies.
 *
 * Supabase Auth mints the hash; this never builds a credential. It exists for emails Twiddl sends
 * itself (re-engagement), where there is no browser PKCE cookie to ride, and it is the same
 * /auth/verify call Supabase's own confirm links use. The token hash is never logged.
 */
export async function verifyAuthTokenHash(type: AuthTokenHashType, tokenHash: string): Promise<boolean> {
  if (!tokenHash) return false;

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (error) {
      // "Invalid" or "already used": a scanner or a second click consumed it first.
      console.warn(`[auth] token hash verification failed for ${type}: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[auth] token hash verification threw: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  }
}