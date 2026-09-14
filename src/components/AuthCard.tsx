'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

export default function AuthCard() {
  const { supabase } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithOtp({ email });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Check your email for a login link.');
    }
  };

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

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
        <button className="button button-primary w-full sm:w-auto" disabled={isLoading} type="submit">
          {isLoading ? 'Sending...' : 'Send sign-in link'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Want to keep exploring? <Link href="/" className="text-violet-300 underline">Back to feed</Link>
      </p>
    </section>
  );
}