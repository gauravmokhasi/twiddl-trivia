import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { readJsonBody } from '@/lib/api-guards';

export async function PATCH(request: Request) {
  const body = await readJsonBody(request);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { isPublic } = body as { isPublic?: unknown };

  if (typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'isPublic boolean is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { error } = await ((supabaseAdmin
    .from('profiles') as any)
    .update({ is_public: isPublic })
    .eq('id', user.id) as any);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, isPublic });
}
