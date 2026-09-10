'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';

export default function UsernamePrompt() {
  const { session } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!session?.user?.id) {
    return null;
  }

  const submitUsername = async () => {
    setIsSaving(true);
    setMessage('');

    const response = await fetch('/api/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data?.error || 'Unable to save username.');
      setIsSaving(false);
      return;
    }

    // On success, navigate directly to the new profile page
    const newUsername = data?.username;
    if (newUsername) {
      router.push(`/profile/${newUsername}`);
      return;
    }

    setMessage('Username saved! Refresh the page to continue.');
    setIsSaving(false);
  };

  return (
    <section className="card">
      <h2 className="text-2xl font-semibold">Create your username</h2>
      <p className="mt-2 text-slate-600">Choose a unique username to claim your profile page.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="input flex-1"
          placeholder="username"
          disabled={isSaving}
        />
        <button
          type="button"
          className="button button-primary"
          onClick={submitUsername}
          disabled={isSaving || username.trim().length < 3}
        >
          {isSaving ? 'Saving...' : 'Save username'}
        </button>
      </div>
      {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
    </section>
  );
}
