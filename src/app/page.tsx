import Link from 'next/link';
import { formatRelativeDate } from '@/lib/utils';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Database } from '@/lib/database.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function HomePage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return (
      <div className="space-y-8">
        <section className="card">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Your 24-hour feed</h2>
              <p className="text-sm text-slate-600">Sign in to see questions from the people you follow.</p>
            </div>
            <Link className="button button-primary" href="/login">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const userId = session.user.id;
  const { data: followeesData } = await supabaseAdmin.from('follows').select('followee_id').eq('follower_id', userId);
  const followees = followeesData as { followee_id: string }[] | null;
  const followeeIds = followees?.map((item) => item.followee_id) ?? [];

  const now = new Date();
  const cutoff = new Date(now.getTime() - DAY_MS).toISOString();

  const { data: feedQuestionsData } = followeeIds.length > 0 ? await supabaseAdmin
    .from('questions')
    .select('id, author_id, text, choices, created_at')
    .in('author_id', followeeIds)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false }) : { data: [] };
  const feedQuestions = feedQuestionsData as { id: string; author_id: string; text: string; choices: string[]; created_at: string }[] | null;

  const authorIds = Array.from(new Set(feedQuestions?.map((question) => question.author_id) ?? []));
  const { data: authorsData } = await supabaseAdmin.from('profiles').select('id, username, display_name').in('id', authorIds);
  const authors = authorsData as { id: string; username: string; display_name: string | null }[] | null;
  const authorMap = new Map(authors?.map((user) => [user.id, user]));

  return (
    <div className="space-y-8">
      <section className="card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Your 24-hour feed</h2>
            <p className="text-sm text-slate-600">Answer fresh questions from people you follow. Answer older unanswered questions on the profile pages of users you follow.</p>
          </div>
          <Link className="button button-primary" href="/ask">
            Ask today&apos;s question
          </Link>
        </div>
      </section>

      <section className="grid gap-6">
        {!feedQuestions || feedQuestions.length === 0 ? (
          <div className="card">
            <p className="text-slate-700">No recent questions from your follow list. Visit the universe to discover more creators.</p>
          </div>
        ) : (
          feedQuestions.map((question) => {
            const author = authorMap.get(question.author_id);
            const questionUrl = `/questions/${question.id}`;
            return (
              <article key={question.id} className="card">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <Link href={`/profile/${author?.username ?? ''}`} className="text-sky-600 font-semibold">
                      {author?.username ?? 'Unknown'}
                    </Link>
                    <p className="mt-2 text-xl font-semibold">{question.text}</p>
                  </div>
                  <span className="text-sm text-slate-500">{formatRelativeDate(question.created_at)}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {question.choices.map((choice, index) => (
                    <span key={choice} className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      {String.fromCharCode(65 + index)}. {choice}
                    </span>
                  ))}
                </div>
                <div className="mt-6">
                  <Link className="button button-secondary" href={questionUrl}>
                    Answer question
                  </Link>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
