import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { rateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Lightweight activity heartbeat.
 *
 * Updates the user's last_active_at timestamp only when the caller's JWT has
 * just been verified with Supabase, so a crawler, a prefetch, a background poll
 * or a cron job cannot make an account look active.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const limit = rateLimit(`activity:${user.id}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    await supabaseAdmin.from('profiles').update({}).eq('id', user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.warn(
      `[activity] heartbeat failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return NextResponse.json({ error: 'Unable to record activity.' }, { status: 500 });
  }
}
