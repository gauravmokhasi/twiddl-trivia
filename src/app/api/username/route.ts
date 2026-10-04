import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { findProfileIdentityConflict } from '@/lib/profile-identity-server';
import { PROFILE_IDENTITY_CONFLICT_MESSAGE, isIdentityConflictError } from '@/lib/profile-identity';

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

  // Usernames and public names share a single namespace, so the handle is checked against both,
  // ignoring case. The trigger on profiles remains the authority; this is the friendly early answer.
  const conflict = await findProfileIdentityConflict(session.user.id, { username: safeUsername });

  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  const { error } = await (supabaseAdmin
    .from('profiles') as any)
    .update({ username: safeUsername })
    .eq('id', session.user.id);

  if (error) {
    // A race between the check above and this update lands here.
    const isConflict = isIdentityConflictError(error);

    return NextResponse.json(
      { error: isConflict ? PROFILE_IDENTITY_CONFLICT_MESSAGE : error.message },
      { status: isConflict ? 409 : 500 },
    );
  }

  return NextResponse.json({ success: true, username: safeUsername });
}
