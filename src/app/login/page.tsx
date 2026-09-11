'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import Link from 'next/link';

export default function LoginPage() {
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
    <div className="space-y-6">
      <section className="card mx-auto max-w-lg p-6 md:p-8">
        <p className="eyebrow">Welcome back</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Sign in to Twiddl</h1>
        <p className="mt-2 text-zinc-400">Enter your email and we will send you a sign-in link.</p>

        <form onSubmit={handleSignIn} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@example.com"
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 focus:border-sky-500 focus:outline-none"
            />
          </label>

          {message ? <p className="text-sm text-slate-700">{message}</p> : null}
          <button className="button button-primary" disabled={isLoading} type="submit">
            {isLoading ? 'Sending...' : 'Send sign-in link'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          Want to keep exploring? <Link href="/" className="text-sky-600 underline">Back to feed</Link>
        </p>
      </section>
    </div>
  );
}
