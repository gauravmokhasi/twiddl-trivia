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
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-2xl font-semibold">Twiddl Universe</h2>
        <p className="mt-2 text-slate-600">Browse public profiles and discover users to follow.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {publicUsers?.map((user) => (
          <article key={user.id} className="card hover:border-sky-500 hover:shadow-md transition">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{user.display_name}</h3>
                <p className="mt-2 text-slate-600">@{user.username}</p>
                <p className="mt-3 text-slate-700">{user.bio}</p>
              </div>
              <div className="flex items-center">
                <ProfileButton profileId={user.id} />
              </div>
            </div>
            <div className="mt-4">
              <Link href={`/profile/${user.username}`} className="text-sky-600 font-semibold">
                View profile
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
