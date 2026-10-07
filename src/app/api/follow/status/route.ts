import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const followeeId = url.searchParams.get('followeeId');

  if (!followeeId) {
    return NextResponse.json({ error: 'followeeId is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ isFollowing: false });
  }

  const { data, error } = await supabaseAdmin
    .from('follows')
    .select('followee_id')
    .eq('follower_id', user.id)
    .eq('followee_id', followeeId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ isFollowing: !!data });
}
