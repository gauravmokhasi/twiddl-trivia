import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // Only ever redirect to a plain path on this site. new URL() treats "//evil.com" as protocol
  // relative and browsers normalise a backslash to a slash, so reject both of those forms.
  const requestedNext = requestUrl.searchParams.get('next') ?? '/';
  const next = requestedNext.startsWith('/') && !/^\/[/\\]/.test(requestedNext) ? requestedNext : '/';

  if (code) {
    const supabase = await createRouteSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', requestUrl.origin));
}
