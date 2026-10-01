import Link from 'next/link';
import AuthCard from '@/components/AuthCard';
import { createServerSupabase } from '@/lib/supabase-server';
import { AUTH_CALLBACK_FAILED_MESSAGE, OAUTH_CALLBACK_FAILED_MESSAGE } from '@/lib/auth-messages';

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

/** The callback route sends these reasons back as ?error=..., never raw provider messages. */
const ERROR_MESSAGES: Record<string, string> = {
  auth: AUTH_CALLBACK_FAILED_MESSAGE,
  oauth: OAUTH_CALLBACK_FAILED_MESSAGE,
};

export default async function LoginPage({ searchParams }: Props) {
  // searchParams is a Promise in this version of Next, so it has to be awaited before use.
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] : undefined;

  // Decided on the server so an already-signed-in visitor never sees the sign-in form flash.
  const supabase = await createServerSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user?.id) {
    return (
      <div className="mx-auto max-w-lg pt-6">
        <section className="card p-6 md:p-8">
          <p className="eyebrow">Already signed in</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">You are signed in</h1>
          <p className="mt-2 text-zinc-400">
            Signed in as <span className="text-zinc-200">{session.user.email ?? 'your account'}</span>. Head back to your feed, or use Sign out in the header to switch accounts.
          </p>
          <Link className="button button-primary mt-5" href="/">Go to your feed</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pt-6">
      {message ? (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {message}
        </div>
      ) : null}
      <AuthCard />
    </div>
  );
}