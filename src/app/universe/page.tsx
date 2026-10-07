import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getDailyQuestionGate, requireAskedToday } from '@/lib/daily-question-gate';
import ProfileButton from '@/components/profile-button';
import UsernameJump from '@/components/username-jump';

const UNIVERSE_PAGE_SIZE = 24;

type Props = {
  searchParams: Promise<{
    page?: string;
  }>;
};

export default async function UniversePage({ searchParams }: Props) {
  // Authorize before reading the directory: hiding cards client-side would still leak the payload.
  const { userId } = await getDailyQuestionGate();
  if (!userId) {
    return (
      <section className="mx-auto max-w-xl space-y-4 pt-12">
        <p className="eyebrow">The social trivia club</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Universe</h1>
        <p className="text-zinc-400">Sign in to see the full list of public users on the app.</p>
        <Link href="/" className="button button-primary">Sign in</Link>
      </section>
    );
  }

  // Signed-in members still need to ask today's question before browsing.
  await requireAskedToday();

  const { page } = await searchParams;
  const currentPage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const from = (currentPage - 1) * UNIVERSE_PAGE_SIZE;
  const to = from + UNIVERSE_PAGE_SIZE - 1;

  const { data: publicUsersData, count } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, bio', { count: 'exact' })
    .eq('is_public', true)
    .order('username')
    .range(from, to);
  const publicUsers = publicUsersData as { id: string; username: string; display_name: string | null; bio: string | null }[] | null;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / UNIVERSE_PAGE_SIZE));

  return (
    <div className="space-y-8 pt-6">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <p className="eyebrow">The social trivia club</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Universe</h2>
        <p className="mt-2 max-w-xl text-zinc-400">Browse public profiles and discover users to follow.</p>
      </section>

      <UsernameJump />

      <section className="grid gap-4 md:grid-cols-2">
        {publicUsers?.map((user) => (
          <article key={user.id} className="card group p-5 hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-lg font-bold text-violet-200">{user.username.charAt(0).toUpperCase()}</span>
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">{user.display_name}</h3>
                  <p className="mt-0.5 text-sm text-violet-300">@{user.username}</p>
                </div>
              </div>
              <div className="shrink-0">
                <ProfileButton profileId={user.id} />
              </div>
            </div>
            <p className="mt-5 min-h-12 text-sm leading-6 text-zinc-400">{user.bio || 'A curious mind in the Twiddl universe.'}</p>
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <Link href={`/profile/${user.username}`} className="text-sm font-semibold text-zinc-300 transition hover:text-violet-300">
                Check out their questions <span className="ml-1 text-violet-300">→</span>
              </Link>
            </div>
          </article>
        ))}
      </section>

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Universe pages">
          {currentPage > 1 ? (
            <Link href={currentPage === 2 ? '/universe' : `/universe?page=${currentPage - 1}`} className="button button-secondary text-sm">
              ← Newer
            </Link>
          ) : null}
          <span className="text-sm text-zinc-500">Page {Math.min(currentPage, totalPages)} of {totalPages}</span>
          {currentPage < totalPages ? (
            <Link href={`/universe?page=${currentPage + 1}`} className="button button-secondary text-sm">
              Older →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
