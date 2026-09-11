import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import ProfileButton from '@/components/profile-button';
import type { Database } from '@/lib/database.types';

export default async function UniversePage() {
  const supabase = await createServerSupabase();
  const { data: publicUsersData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, bio')
    .eq('is_public', true)
    .order('username');
  const publicUsers = publicUsersData as { id: string; username: string; display_name: string | null; bio: string | null }[] | null;

  return (
    <div className="space-y-8 pt-6">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <p className="eyebrow">The social trivia club</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Universe</h2>
        <p className="mt-2 max-w-xl text-zinc-400">Browse public profiles and discover users to follow.</p>
      </section>

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
                View profile <span className="ml-1 text-violet-300">→</span>
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
