'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function saveBlockState(profileId: string, blocked: boolean): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/block', {
      method: blocked ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockedId: profileId }),
    });
  } catch {
    throw new Error('Could not connect. Please try again.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to update blocking. Please try again.');
  }
}

type Props = {
  profileId: string;
  /** Whether the caller already blocks this profile, so the label starts honest. */
  initialIsBlocked?: boolean;
};

/**
 * The Block control on somebody else's profile header.
 *
 * Blocking is private to the caller: this only ever posts the caller's own id
 * server-side, and the confirmation text is shown to the blocker alone.
 */
export function BlockButton({ profileId, initialIsBlocked = false }: Props) {
  const [isBlocked, setIsBlocked] = useState(initialIsBlocked);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  const toggle = async () => {
    if (pending) return;
    const next = !isBlocked;

    setPending(true);
    setMessage('');
    try {
      await saveBlockState(profileId, next);
      setIsBlocked(next);
      setMessage(next ? 'Blocked.' : 'Unblocked.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update blocking. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="button button-ghost"
        onClick={toggle}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Saving...' : isBlocked ? 'Unblock' : 'Block'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}

/**
 * Unblock control inside the caller's own block list. Unblocking never restores
 * the follow the block removed, so the row is simply re-read from the server.
 */
export function UnblockButton({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const unblock = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await saveBlockState(profileId, false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update blocking. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="button button-secondary text-sm" onClick={unblock} disabled={pending} aria-busy={pending}>
        {pending ? 'Unblocking...' : 'Unblock'}
      </button>
      {error ? <p role="status" className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
