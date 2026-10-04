'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  questionId: string;
  /** Where to go once the question is gone. The question's own page would 404, so pass a target. */
  redirectTo?: string;
  /** Extra classes so the trigger can sit quietly in a list row. */
  className?: string;
};

type Status = 'idle' | 'confirming' | 'deleting';

/**
 * Deletes one of the viewer's own questions. Two taps on purpose: the first opens a confirmation, so
 * a stray click in a long archive never removes anything.
 */
export default function DeleteQuestionButton({ questionId, redirectTo, className = '' }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const remove = async () => {
    setStatus('deleting');
    setError('');

    try {
      const response = await fetch(`/api/questions?questionId=${encodeURIComponent(questionId)}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || 'Unable to delete that question.');
        setStatus('idle');
        return;
      }

      setStatus('idle');

      if (redirectTo) {
        router.push(redirectTo);
        return;
      }

      router.refresh();
    } catch {
      setError('Unable to delete that question.');
      setStatus('idle');
    }
  };

  if (status === 'confirming' || status === 'deleting') {
    const isDeleting = status === 'deleting';

    return (
      <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className="text-zinc-500">Delete this question?</span>
        <button
          type="button"
          onClick={remove}
          disabled={isDeleting}
          className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          disabled={isDeleting}
          className="text-zinc-500 underline decoration-dotted underline-offset-4 transition hover:text-zinc-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1 text-xs">
      <button
        type="button"
        onClick={() => {
          setError('');
          setStatus('confirming');
        }}
        className={`text-zinc-600 underline decoration-dotted underline-offset-4 transition hover:text-rose-300 ${className}`}
      >
        Delete
      </button>
      {error ? <span className="max-w-[16rem] text-right text-rose-300">{error}</span> : null}
    </span>
  );
}