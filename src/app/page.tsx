import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getDailyQuestionStatus, DAILY_QUESTION_WINDOW_MS } from '@/lib/daily-question';
import { unansweredSessionQuestions } from '@/lib/session-questions';
import HomeFlow from '@/components/HomeFlow';
import LoggedOutLanding from '@/components/LoggedOutLanding';

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return <LoggedOutLanding />;
  }

  const userId = session.user.id;
  const { hasAsked } = await getDailyQuestionStatus(userId);

  const { data: followeesData } = await supabaseAdmin.from('follows').select('followee_id').eq('follower_id', userId);
  const followeeIds = (followeesData as { followee_id: string }[] | null)?.map((item) => item.followee_id) ?? [];

  const now = new Date();
  const cutoff = new Date(now.getTime() - DAILY_QUESTION_WINDOW_MS).toISOString();
  const questions = await unansweredSessionQuestions({ userId, authorIds: followeeIds, sinceIso: cutoff });

  return <HomeFlow hasAskedToday={hasAsked} questions={questions} />;
}