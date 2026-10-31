import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { readJsonBody } from '@/lib/api-guards';
import { TWIDDLOO_ID } from '@/lib/twiddloo';
import { FOLLOW_REFUSED_MESSAGE } from '@/lib/user-blocks';
import { hasBlocked } from '@/lib/user-blocks-server';

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { followeeId } = body as { followeeId?: unknown };
  if (typeof followeeId !== 'string' || !followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (user.id === followeeId) {
    return NextResponse.json({ error: 'You cannot follow yourself.' }, { status: 400 });
  }

  const { data: followee, error: followeeError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', followeeId)
    .maybeSingle();

  if (followeeError) {
    return NextResponse.json({ error: followeeError.message }, { status: 500 });
  }

  if (!followee) {
    return NextResponse.json({ error: 'That profile does not exist.' }, { status: 404 });
  }

  // A refused follow looks exactly like any other failure: the wording never
  // mentions blocks, so the caller cannot tell why it did not work.
  if (await hasBlocked(followeeId, user.id)) {
    return NextResponse.json({ error: FOLLOW_REFUSED_MESSAGE }, { status: 403 });
  }

  const { error } = await (supabaseAdmin.from('follows') as any).upsert({
    follower_id: user.id,
    followee_id: followeeId,
  }, { onConflict: ['follower_id', 'followee_id'] });

  if (error) {
    // A block can land between the check above and this insert, and the
    // database trigger refuses it there. Re-check so the trigger's message is
    // never echoed back, while unrelated failures keep their original copy.
    if (await hasBlocked(followeeId, user.id)) {
      return NextResponse.json({ error: FOLLOW_REFUSED_MESSAGE }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (followeeId === TWIDDLOO_ID) {
    await (supabaseAdmin.from('bot_follow_opt_outs') as any)
      .delete()
      .eq('user_id', user.id);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { followeeId } = body as { followeeId?: unknown };
  if (typeof followeeId !== 'string' || !followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { error } = await (supabaseAdmin
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followee_id', followeeId) as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (followeeId === TWIDDLOO_ID) {
    const { error: optOutError } = await (supabaseAdmin.from('bot_follow_opt_outs') as any).upsert({
      user_id: user.id,
    }, { onConflict: 'user_id' });

    if (optOutError) {
      return NextResponse.json({ error: optOutError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
