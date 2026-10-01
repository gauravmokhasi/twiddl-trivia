'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { EMAIL_SENT_MESSAGE, friendlyAuthMessage } from '@/lib/auth-messages';

/** Google's mark, inlined so no icon dependency is needed. */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-4 w-4">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function AuthCard() {
  // The sign-in form is server-rendered so it is always present in the HTML. The already-signed-in
  // case is handled on the server below rather than with a client loading gate, which would have
  // kept the form (and the Google button) out of the initial payload.
  const { session, supabase } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isStartingGoogle, setIsStartingGoogle] = useState(false);

  // The disabled attribute only applies after React re-renders, so these refs close the same-tick
  // window in which a double click could fire two requests (and therefore two emails).
  const emailInFlight = useRef(false);
  const googleInFlight = useRef(false);

  const isBusy = isSendingEmail || isStartingGoogle;

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emailInFlight.current) return;

    emailInFlight.current = true;
    setIsSendingEmail(true);
    setMessage('');
    setIsError(false);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setIsError(true);
        setMessage(friendlyAuthMessage(error));
      } else {
        setMessage(EMAIL_SENT_MESSAGE);
      }
    } catch {
      setIsError(true);
      setMessage(friendlyAuthMessage(null));
    } finally {
      setIsSendingEmail(false);
      emailInFlight.current = false;
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleInFlight.current) return;

    googleInFlight.current = true;
    setIsStartingGoogle(true);
    setMessage('');
    setIsError(false);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setIsError(true);
        setMessage(friendlyAuthMessage(error));
        setIsStartingGoogle(false);
        googleInFlight.current = false;
      }
      // On success the browser navigates to Google, so the pending state stays until then.
    } catch {
      setIsError(true);
      setMessage(friendlyAuthMessage(null));
      setIsStartingGoogle(false);
      googleInFlight.current = false;
    }
  };
  if (session?.user?.id) {
    return (
      <section className="card p-6 md:p-8">
        <p className="eyebrow">Already signed in</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">You are signed in</h1>
        <p className="mt-2 text-zinc-400">
          Signed in as <span className="text-zinc-200">{session.user.email ?? 'your account'}</span>. Head back to your feed, or use Sign out in the header to switch accounts.
        </p>
        <Link className="button button-primary mt-5" href="/">Go to your feed</Link>
      </section>
    );
  }

  return (
    <section className="card p-6 md:p-8">
      <p className="eyebrow">Welcome</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Sign in to Twiddl</h1>
      <p className="mt-2 text-zinc-400">New here? Either option creates your account.</p>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isBusy}
        className="button button-secondary mt-6 w-full gap-3"
      >
        <GoogleMark />
        {isStartingGoogle ? 'Taking you to Google...' : 'Continue with Google'}
      </button>

      <div className="mt-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSignIn} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-zinc-300">
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="you@example.com"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
          />
        </label>

        {message ? (
          <p className={`text-sm ${isError ? 'text-rose-300' : 'text-zinc-300'}`}>{message}</p>
        ) : null}

        <button className="button button-primary w-full sm:w-auto" disabled={isBusy} type="submit">
          {isSendingEmail ? 'Sending...' : 'Send sign-in link'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Want to keep exploring? <Link href="/" className="text-violet-300 underline">Back to feed</Link>
      </p>
    </section>
  );
}