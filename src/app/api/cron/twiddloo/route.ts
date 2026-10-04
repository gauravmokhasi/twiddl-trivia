import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureTwiddloo, seedTodaysTwiddlooQuestion, TWIDDLOO_ID } from '@/lib/twiddloo';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    await ensureTwiddloo();

    const { data: usersData, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .neq('id', TWIDDLOO_ID);
    const users = usersData as { id: string }[] | null;

    if (usersError) throw new Error(usersError.message);

    for (const user of users ?? []) {
      await (supabaseAdmin.from('follows') as any).upsert({
        follower_id: TWIDDLOO_ID,
        followee_id: user.id,
      }, { onConflict: ['follower_id', 'followee_id'] });
    }

    const questionId = await seedTodaysTwiddlooQuestion();

    return NextResponse.json({ success: true, questionId, usersProcessed: users?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'twiddloo job failed.' }, { status: 500 });
  }
}
