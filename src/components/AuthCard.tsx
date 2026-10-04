'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { EMAIL_SENT_MESSAGE, friendlyAuthMessage } from '@/lib/auth-messages';

export default function AuthCard() {
  // The sign-in form is server-rendered so it is always present in the HTML. The already-signed-in
  // case is handled on the server, which avoids a client loading gate hiding the form.
  const { session, supabase } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // The disabled attribute only applies after React re-renders, so this ref closes the same-tick
  // window in which a double click could fire two requests (and therefore two emails).
  const emailInFlight = useRef(false);

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
      <p className="mt-2 text-zinc-400">Enter your email and we will send you a sign-in link. New here? That creates your account.</p>

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

        <button className="button button-primary w-full sm:w-auto" disabled={isSendingEmail} type="submit">
          {isSendingEmail ? 'Sending...' : 'Send sign-in link'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Want to keep exploring? <Link href="/" className="text-violet-300 underline">Back to feed</Link>
      </p>
    </section>
  );
}