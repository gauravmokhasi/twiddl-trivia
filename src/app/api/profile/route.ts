import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { readJsonBody } from '@/lib/api-guards';
import { findProfileIdentityConflict } from '@/lib/profile-identity-server';
import { PROFILE_IDENTITY_CONFLICT_MESSAGE, isIdentityConflictError } from '@/lib/profile-identity';

const MAX_DISPLAY_NAME = 40;
const MAX_BYLINE = 160;

export async function PATCH(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { displayName, bio } = body as { displayName?: unknown; bio?: unknown };

  if (typeof displayName !== 'string' || !displayName.trim()) {
    return NextResponse.json({ error: 'A public name is required.' }, { status: 400 });
  }

  if (typeof bio !== 'string') {
    return NextResponse.json({ error: 'The byline must be text.' }, { status: 400 });
  }

  const safeDisplayName = displayName.trim();
  const safeBio = bio.trim();

  if (safeDisplayName.length > MAX_DISPLAY_NAME) {
    return NextResponse.json({ error: `Public name must be ${MAX_DISPLAY_NAME} characters or fewer.` }, { status: 400 });
  }

  if (safeBio.length > MAX_BYLINE) {
    return NextResponse.json({ error: `Byline must be ${MAX_BYLINE} characters or fewer.` }, { status: 400 });
  }

  const user = await getAuthenticatedUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // The public name shares one namespace with usernames, so it is checked against both, ignoring
  // case. The trigger on profiles remains the authority; this is the friendly early answer.
  const conflict = await findProfileIdentityConflict(user.id, { displayName: safeDisplayName });

  if (conflict) {
    return NextResponse.json({ error: conflict }, { status: 409 });
  }

  // An empty byline is stored as null so the profile falls back to the default line.
  const { error } = await ((supabaseAdmin
    .from('profiles') as any)
    .update({ display_name: safeDisplayName, bio: safeBio || null })
    .eq('id', user.id) as any);

  if (error) {
    // A race between the check above and this update lands here.
    const isConflict = isIdentityConflictError(error);

    return NextResponse.json(
      { error: isConflict ? PROFILE_IDENTITY_CONFLICT_MESSAGE : error.message },
      { status: isConflict ? 409 : 500 },
    );
  }

  return NextResponse.json({ success: true, displayName: safeDisplayName, bio: safeBio || null });
}