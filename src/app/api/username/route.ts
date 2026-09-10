import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const body = await request.json();
  const { username } = body;

  if (typeof username !== 'string' || username.trim().length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }

  const safeUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(safeUsername)) {
    return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores.' }, { status: 400 });
  }

  const routeSupabase = await createRouteSupabase();
  const { data: { session }, error: authError } = await routeSupabase.auth.getSession();

  if (authError || !session?.user?.id) {
    return NextResponse.json({ error: authError?.message || 'Authentication required.' }, { status: 401 });
  }

  // Use service-role client for uniqueness check and update to avoid RLS/privilege issues
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', safeUsername)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  const { error } = await (supabaseAdmin
    .from('profiles') as any)
    .update({ username: safeUsername })
    .eq('id', session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, username: safeUsername });
}
