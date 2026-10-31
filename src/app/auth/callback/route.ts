import { NextResponse } from 'next/server';
import { exchangeAuthCode, verifyAuthTokenHash, type AuthTokenHashType } from '@/lib/auth-code';
import { safeNextPath } from '@/lib/auth-redirect';

// The magic-link types Supabase Auth may hand us. Anything else is refused, so
// this route can never be used to invoke an unrelated verification.
function isAuthTokenHashType(value: string | null | undefined): value is AuthTokenHashType {
  return value === 'magiclink' || value === 'recovery' || value === 'signup' || value === 'email_change';
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const requestedType = requestUrl.searchParams.get('type');
  const next = safeNextPath(requestUrl.searchParams.get('next'));

  if (code) {
    const exchanged = await exchangeAuthCode(code);

    if (exchanged) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  } else if (tokenHash && isAuthTokenHashType(requestedType)) {
    // Re-engagement emails send their own message, so they cannot ride the
    // browser's PKCE cookie. The token hash is minted only by a POST from
    // Twiddl's own confirmation page, and verifying it here writes the session
    // through Supabase Auth exactly like a code exchange does.
    const verified = await verifyAuthTokenHash(requestedType, tokenHash);

    if (verified) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Reached for a missing, expired or already-used credential. The friendly copy lives on /login.
  return NextResponse.redirect(new URL('/login?error=auth', requestUrl.origin));
}
