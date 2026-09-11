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
    return <section className="mx-auto max-w-2xl space-y-4 pt-6"><p className="eyebrow">Your daily mental workout</p><h2 className="text-3xl font-bold tracking-tight text-zinc-100">Your 24-hour feed</h2><p className="max-w-xl text-zinc-400">Sign in to see questions from the people you follow.</p><Link className="button button-primary mt-3" href="/login">Sign in</Link></section>;
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
    <div className="space-y-8 pt-6">
      <section className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Your daily mental workout</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Your 24-hour feed</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Answer fresh questions from people you follow. Answer older unanswered questions on the profile pages of users you follow.</p>
        </div>
        <Link className="button button-primary shrink-0" href="/ask">Ask today&apos;s question</Link>
      </section>

      <section className="grid gap-6">
        {!feedQuestions || feedQuestions.length === 0 ? (
          <div className="card border-dashed border-white/10">
            <p className="text-zinc-400">No recent questions from your follow list. Visit the Universe to discover more creators.</p>
          </div>
        ) : (
          feedQuestions.map((question) => {
            const author = authorMap.get(question.author_id);
            const questionUrl = `/questions/${question.id}`;
            return (
              <article key={question.id} className="card group relative overflow-hidden p-5 md:p-6">
                <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl transition group-hover:bg-violet-500/20" />
                <div className="relative flex items-center justify-between gap-3">
                  <Link href={`/profile/${author?.username ?? ''}`} className="flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-200">{(author?.username ?? '?').charAt(0).toUpperCase()}</span>
                    @{author?.username ?? 'unknown'}
                  </Link>
                  <span className="text-xs text-zinc-500">{formatRelativeDate(question.created_at)}</span>
                </div>
                <div className="relative mt-5">
                    <p className="max-w-3xl text-2xl font-bold leading-tight tracking-tight text-zinc-50 md:text-3xl">{question.text}</p>
                </div>
                <div className="relative mt-5 flex flex-wrap gap-2">
                  {question.choices.map((choice, index) => (
                    <span key={choice} className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm text-zinc-300">
                      <span className="mr-1.5 font-semibold text-violet-300">{String.fromCharCode(65 + index)}</span>{choice}
                    </span>
                  ))}
                </div>
                <div className="relative mt-6">
                  <Link className="button button-secondary text-sm" href={questionUrl}>
                    Answer question <span className="ml-2 text-violet-300">→</span>
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
