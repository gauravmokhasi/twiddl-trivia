import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TWIDDL_BOT_ID } from '@/lib/twiddl-bot';

export async function POST(request: Request) {
  const body = await request.json();
  const { followeeId } = body;
  if (!followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  if (session.user.id === followeeId) {
    return NextResponse.json({ error: 'You cannot follow yourself.' }, { status: 400 });
  }

  const { error } = await (supabaseAdmin.from('follows') as any).upsert({
    follower_id: session.user.id,
    followee_id: followeeId,
  }, { onConflict: ['follower_id', 'followee_id'] });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (followeeId === TWIDDL_BOT_ID) {
    await (supabaseAdmin.from('bot_follow_opt_outs') as any)
      .delete()
      .eq('user_id', session.user.id);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const { followeeId } = body;
  if (!followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { error } = await (supabaseAdmin
    .from('follows')
    .delete()
    .eq('follower_id', session.user.id)
    .eq('followee_id', followeeId) as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (followeeId === TWIDDL_BOT_ID) {
    const { error: optOutError } = await (supabaseAdmin.from('bot_follow_opt_outs') as any).upsert({
      user_id: session.user.id,
    }, { onConflict: 'user_id' });

    if (optOutError) {
      return NextResponse.json({ error: optOutError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
