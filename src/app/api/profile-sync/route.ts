import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureDefaultRelationshipsForUser } from '@/lib/twiddloo';
import { isIdentityConflictError } from '@/lib/profile-identity';

export async function POST() {
  const supabase = await createRouteSupabase();
  const { data: { session }, error: authError } = await supabase.auth.getSession();

  if (authError || !session?.user) {
    return NextResponse.json({ error: authError?.message ?? 'Authentication required.' }, { status: 401 });
  }

  const user = session.user;
  const email = user.email;

  if (!email) {
    return NextResponse.json({ error: 'Email not available on session.' }, { status: 400 });
  }

  const { data: existingProfileData, error: existingProfileError } = await supabaseAdmin
    .from('profiles')
    .select('username, display_name, is_public')
    .eq('id', user.id)
    .maybeSingle();
  const existingProfile = existingProfileData as { username: string; display_name: string | null; is_public: boolean } | null;

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }

  // Handles are always stored lowercase, so the profile page and lookups never depend on the case a
  // user typed. A derived name that is too short is left alone for /profile to prompt about.
  const derivedUsername = (user.user_metadata?.username || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_');

  const username =
    existingProfile?.username && !existingProfile.username.startsWith('user_')
      ? existingProfile.username
      : (derivedUsername || `user_${user.id}`);

  const display_name = existingProfile?.display_name ?? user.user_metadata?.name ?? email.split('@')[0] ?? user.id;
  const is_public = existingProfile?.is_public ?? true;

  const { error } = await (supabaseAdmin.from('profiles') as any).upsert({
    id: user.id,
    email,
    username,
    display_name,
    is_public,
  }, { onConflict: 'id' });

  if (error) {
    // Sign-in derives a handle and a public name from the email local part and auth metadata, and
    // either can already belong to someone else (two "gaurav" accounts, or a new user whose
    // metadata name matches an existing profile's public name). Retry once with values built from
    // the auth user id, which are unique by construction; the "user_" prefix also marks the profile
    // as still needing a username, which is what sends the user to /profile to choose one.
    if (!isIdentityConflictError(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const placeholder = `user_${user.id}`;
    const { error: retryError } = await (supabaseAdmin.from('profiles') as any).upsert({
      id: user.id,
      email,
      username: placeholder,
      display_name: placeholder,
      is_public,
    }, { onConflict: 'id' });

    if (retryError) {
      return NextResponse.json({ error: retryError.message }, { status: 500 });
    }
  }

  try {
    await ensureDefaultRelationshipsForUser(user.id);
  } catch (relationshipError) {
    return NextResponse.json({ error: relationshipError instanceof Error ? relationshipError.message : 'Unable to initialize twiddloo relationships.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
