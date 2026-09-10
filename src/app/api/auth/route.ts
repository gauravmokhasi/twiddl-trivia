import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const supabase = await createRouteSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}
