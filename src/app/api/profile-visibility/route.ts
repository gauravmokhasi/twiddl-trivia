import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(request: Request) {
  const body = await request.json();
  const { isPublic } = body;

  if (typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'isPublic boolean is required.' }, { status: 400 });
  }

  const routeSupabase = await createRouteSupabase();
  const { data: { session }, error: authError } = await routeSupabase.auth.getSession();

  if (authError || !session?.user?.id) {
    return NextResponse.json({ error: authError?.message || 'Authentication required.' }, { status: 401 });
  }

  const { error } = await ((supabaseAdmin
    .from('profiles') as any)
    .update({ is_public: isPublic })
    .eq('id', session.user.id) as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, isPublic });
}
