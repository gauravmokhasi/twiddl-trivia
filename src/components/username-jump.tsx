'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UsernameJump() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = username.trim();
    setMessage('');

    if (query.length < 3) {
      setMessage('Enter a username with at least 3 characters.');
      return;
    }

    setIsSearching(true);

    const response = await fetch(`/api/profile-lookup?username=${encodeURIComponent(query)}`);
    const data = await response.json().catch(() => null);
    setIsSearching(false);

    if (!response.ok) {
      setMessage(data?.error || 'Unable to look up that username right now.');
      return;
    }

    if (!data?.found) {
      setMessage(`No user found with the username "${query}".`);
      return;
    }

    router.push(`/profile/${data.username}`);
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="text-sm font-medium text-zinc-300">Know someone&apos;s username?</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="username"
            disabled={isSearching}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
          />
        </label>
        <button type="submit" className="button button-primary text-sm" disabled={isSearching}>
          {isSearching ? 'Looking...' : 'Go to profile'}
        </button>
      </div>
      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
      <p className="text-xs text-zinc-500">Private profiles are never listed here. If someone shared their username with you, enter it above to open their profile and follow them.</p>
    </form>
  );
}