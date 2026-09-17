import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Resolves a typed-in username to a profile. Private profiles are unlisted rather than secret,
 * so an exact handle is deliberately enough to find one.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('username') ?? '').trim();

  if (query.length < 3) {
    return NextResponse.json({ found: false });
  }

  // Both forms so a stored mixed-case handle (such as twiddlBot) still resolves.
  const candidates = Array.from(new Set([query.toLowerCase(), query]));

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .in('username', candidates)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({ found: true, username: (data as { username: string }).username });
}