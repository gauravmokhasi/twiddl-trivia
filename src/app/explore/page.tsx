import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { unansweredSessionQuestions } from '@/lib/session-questions';
import TriviaSession from '@/components/TriviaSession';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async function ExplorePage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return (
      <section className="card mx-auto max-w-2xl p-6 pt-8 md:p-8">
        <p className="eyebrow">Explore</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100">Sign in to explore</h2>
        <p className="mt-2 text-zinc-400">Explore lines up questions from across the whole platform, whether you follow the author or not.</p>
        <Link className="button button-primary mt-5" href="/login">Sign in</Link>
      </section>
    );
  }

  const now = new Date();
  const sinceIso = new Date(now.getTime() - WEEK_MS).toISOString();
  const questions = await unansweredSessionQuestions({ userId: session.user.id, sinceIso, publicOnly: true });

  return (
    <div>
      <section className="mx-auto max-w-3xl pt-6">
        <p className="eyebrow">Explore</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Questions from across Twiddl</h2>
        <p className="mt-2 text-zinc-400">Everything asked in the last 7 days that you have not answered yet, from people you follow and people you have never met.</p>
      </section>

      <TriviaSession
        questions={questions}
        headerLabel="Explore"
        endState={{
          eyebrow: 'End of explore',
          title: "That's the whole week.",
          message: 'You have answered every question posted across Twiddl in the last seven days.',
          primaryLabel: "Back to today's feed",
          primaryHref: '/',
          secondaryLabel: 'Explore the Universe',
          secondaryHref: '/universe',
        }}
      />
    </div>
  );
}