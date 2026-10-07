import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';

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

  // Unauthenticated by design (see above), so throttle per IP to blunt enumeration.
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const limited = rateLimit(`profile-lookup:${ip}`, 20, 60 * 1000);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many lookups. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  // Both forms so a stored mixed-case handle (such as twiddloo) still resolves.
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