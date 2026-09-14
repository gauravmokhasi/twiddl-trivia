import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getDailyQuestionStatus, DAILY_QUESTION_WINDOW_MS } from '@/lib/daily-question';
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
  const { data: feedQuestionsData } = followeeIds.length > 0 ? await supabaseAdmin
    .from('questions')
    .select('id, author_id, text, choices, correct_answer_index, question_type, correct_answer, is_public, created_at')
    .in('author_id', followeeIds)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }) : { data: [] };
  const feedQuestions = feedQuestionsData as {
    id: string;
    author_id: string;
    text: string;
    choices: string[];
    correct_answer_index: number;
    question_type: 'multiple_choice' | 'free_text';
    correct_answer: string | null;
    is_public: boolean;
    created_at: string;
  }[] | null;

  const authorIds = Array.from(new Set(feedQuestions?.map((question) => question.author_id) ?? []));
  const { data: authorsData } = authorIds.length > 0
    ? await supabaseAdmin.from('profiles').select('id, username').in('id', authorIds)
    : { data: [] as { id: string; username: string }[] };
  const authorMap = new Map(((authorsData as { id: string; username: string }[] | null) ?? []).map((author) => [author.id, author.username]));

  const feedQuestionIds = (feedQuestions ?? []).map((question) => question.id);
  const { data: answeredData } = feedQuestionIds.length > 0
    ? await supabaseAdmin.from('answers').select('question_id').eq('responder_id', userId).in('question_id', feedQuestionIds)
    : { data: [] as { question_id: string }[] };
  const answeredIds = new Set(((answeredData as { question_id: string }[] | null) ?? []).map((answer) => answer.question_id));

  const sessionQuestions = (feedQuestions ?? []).filter((question) => question.author_id !== userId && !answeredIds.has(question.id)).map((question) => ({
    ...question,
    author_username: authorMap.get(question.author_id) ?? 'unknown',
  }));

  return <HomeFlow hasAskedToday={hasAsked} questions={sessionQuestions} />;
}