import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const followeeId = url.searchParams.get('followeeId');

  if (!followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ isFollowing: false });
  }

  const { data, error } = await supabaseAdmin
    .from('follows')
    .select('followee_id')
    .eq('follower_id', session.user.id)
    .eq('followee_id', followeeId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ isFollowing: !!data });
}
