import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import UsernamePrompt from '@/components/UsernamePrompt';

export default async function MyProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return (
      <div className="space-y-6">
        <section className="card">
          <h2 className="text-2xl font-semibold">Sign in to access your profile</h2>
          <p className="mt-2 text-slate-600">You need to sign in before you can view or edit your profile.</p>
          <Link href="/login" className="button button-primary">
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  const userId = session.user.id;
  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('username, display_name')
    .eq('id', userId)
    .maybeSingle();
  const profile = profileData as { username: string; display_name: string | null } | null;

  if (profileError) {
    throw new Error(profileError.message);
  }

  const username = profile?.username;

  if (username && !username.startsWith('user_')) {
    redirect(`/profile/${username}`);
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-2xl font-semibold">Create your username</h2>
        <p className="mt-2 text-slate-600">Choose a unique username to publish your profile page and make it easy for others to follow you.</p>
      </section>
      <UsernamePrompt />
    </div>
  );
}
