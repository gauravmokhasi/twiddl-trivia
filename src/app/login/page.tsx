import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import { getAuthenticatedServerUser } from '@/lib/auth-server';
import { exchangeAuthCode } from '@/lib/auth-code';
import { AUTH_CALLBACK_FAILED_MESSAGE } from '@/lib/auth-messages';

type Props = {
  searchParams: Promise<{
    error?: string;
    code?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  // searchParams is a Promise in this version of Next, so it has to be awaited before use.
  const { error, code } = await searchParams;

  // If a sign-in link lands here (rather than on /auth/callback), exchange the code server-side so
  // the very first click signs the user in, and then continue with a clean URL.
  if (code) {
    const exchanged = await exchangeAuthCode(code);
    if (exchanged) {
      redirect('/');
    }
  }

  const message = error === 'auth' ? AUTH_CALLBACK_FAILED_MESSAGE : undefined;

  // Decided on the server so an already-signed-in visitor never sees the sign-in form flash.
  const user = await getAuthenticatedServerUser();

  if (user?.id) {
    return (
      <div className="mx-auto max-w-lg pt-6">
        <section className="card p-6 md:p-8">
          <p className="eyebrow">Already signed in</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">You are signed in</h1>
          <p className="mt-2 text-zinc-400">
            Signed in as <span className="text-zinc-200">{user.email ?? 'your account'}</span>. Head back to your feed, or use Sign out in the header to switch accounts.
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