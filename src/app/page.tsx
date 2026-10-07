import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedServerUser } from '@/lib/auth-server';
import { getDailyQuestionStatus, DAILY_QUESTION_WINDOW_MS } from '@/lib/daily-question';
import { unansweredSessionQuestions } from '@/lib/session-questions';
import { exchangeAuthCode } from '@/lib/auth-code';
import HomeFlow from '@/components/HomeFlow';
import LoggedOutLanding from '@/components/LoggedOutLanding';

type Props = {
  searchParams: Promise<{
    code?: string;
  }>;
};

export default async function HomePage({ searchParams }: Props) {
  // A sign-in link can land here when the callback URL is not in Supabase's redirect allow-list, in
  // which case Supabase uses the Site URL (this route). Exchanging the code here as well means the
  // first click signs the user in instead of the second.
  const { code } = await searchParams;
  if (code) {
    const exchanged = await exchangeAuthCode(code);
    if (exchanged) {
      redirect('/');
    }
  }

  const user = await getAuthenticatedServerUser();

  if (!user?.id) {
    return <LoggedOutLanding />;
  }

  const userId = user.id;
  const [{ hasAsked }, { data: followeesData }] = await Promise.all([
    getDailyQuestionStatus(userId),
    supabaseAdmin.from('follows').select('followee_id').eq('follower_id', userId),
  ]);
  const followeeIds = (followeesData as { followee_id: string }[] | null)?.map((item) => item.followee_id) ?? [];

  const now = new Date();
  const cutoff = new Date(now.getTime() - DAILY_QUESTION_WINDOW_MS).toISOString();
  const questions = await unansweredSessionQuestions({ userId, authorIds: followeeIds, sinceIso: cutoff });

  return <HomeFlow hasAskedToday={hasAsked} questions={questions} />;
}