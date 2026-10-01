import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // Supabase sends provider failures (for example the user cancelling Google) back to this URL as
  // ?error=access_denied rather than throwing, so handle that before looking for a code.
  const providerError = requestUrl.searchParams.get('error');

  // Only ever redirect to a plain path on this site. new URL() treats "//evil.com" as protocol
  // relative and browsers normalise a backslash to a slash, so reject both of those forms.
  const requestedNext = requestUrl.searchParams.get('next') ?? '/';
  const next = requestedNext.startsWith('/') && !/^\/[/\\]/.test(requestedNext) ? requestedNext : '/';

  if (providerError) {
    return NextResponse.redirect(new URL('/login?error=oauth', requestUrl.origin));
  }

  if (code) {
    const supabase = await createRouteSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', requestUrl.origin));
}
