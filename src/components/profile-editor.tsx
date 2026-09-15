'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  displayName: string | null;
  bio: string | null;
};

const DEFAULT_BYLINE = 'A curious mind in the Twiddl universe.';
const MAX_DISPLAY_NAME = 40;
const MAX_BYLINE = 160;

export default function ProfileEditor({ displayName, bio }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(displayName ?? '');
  const [byline, setByline] = useState(bio ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const openEditor = () => {
    setName(displayName ?? '');
    setByline(bio ?? '');
    setError('');
    setMessage('');
    setIsOpen(true);
  };

  const cancel = () => {
    setError('');
    setMessage('');
    setIsOpen(false);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const trimmedName = name.trim();
    const trimmedByline = byline.trim();

    if (!trimmedName) {
      setError('Public name cannot be empty.');
      return;
    }

    if (trimmedName.length > MAX_DISPLAY_NAME) {
      setError(`Public name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
      return;
    }

    if (trimmedByline.length > MAX_BYLINE) {
      setError(`Byline must be ${MAX_BYLINE} characters or fewer.`);
      return;
    }

    setIsSaving(true);

    const response = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: trimmedName, bio: trimmedByline }),
    });

    const data = await response.json().catch(() => null);
    setIsSaving(false);

    if (!response.ok) {
      setError(data?.error || 'Unable to save your profile.');
      return;
    }

    setName(data?.displayName ?? trimmedName);
    setByline(typeof data?.bio === 'string' ? data.bio : '');
    setIsOpen(false);
    setMessage('Saved.');
    router.refresh();
  };

  if (!isOpen) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-5">
        <button type="button" className="button button-secondary text-sm" onClick={openEditor}>
          Edit name &amp; byline
        </button>
        {message ? <span className="text-sm font-semibold text-emerald-300">{message}</span> : null}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-4 border-t border-white/[0.07] pt-5">
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Public name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_DISPLAY_NAME}
          disabled={isSaving}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
          placeholder="Your public name"
        />
        <span className="mt-1 block text-xs text-zinc-500">This is the heading on your profile and the name shown next to your answers.</span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Byline</span>
        <textarea
          value={byline}
          onChange={(event) => setByline(event.target.value)}
          rows={2}
          maxLength={MAX_BYLINE}
          disabled={isSaving}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
          placeholder={DEFAULT_BYLINE}
        />
        <span className="mt-1 block text-xs text-zinc-500">A short line under your name. Leave it empty to use &ldquo;{DEFAULT_BYLINE}&rdquo;.</span>
      </label>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="button button-primary text-sm" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="button button-ghost text-sm" onClick={cancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
    </form>
  );
}