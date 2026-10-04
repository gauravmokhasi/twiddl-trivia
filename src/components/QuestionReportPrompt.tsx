'use client';

import { useState } from 'react';
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from '@/lib/question-reports';

type Props = {
  questionId: string;
  /** Used in the copy so the note feels addressed to a person, when the author is known. */
  authorUsername?: string | null;
};

type Status = 'idle' | 'open' | 'sending' | 'sent';

/**
 * The quiet failsafe for a question that looks wrong or ambiguous.
 *
 * It only ever appears after an incorrect answer, it is deliberately understated, and sending is
 * optional in every way: the author is the only person who sees it and the note can be anonymous.
 */
export default function QuestionReportPrompt({ questionId, authorUsername }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState('');

  const who = authorUsername ? `@${authorUsername}` : 'the author';

  const send = async (reason: ReportReason) => {
    setStatus('sending');
    setError('');

    try {
      const response = await fetch('/api/question-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, reason, anonymous }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || 'Unable to send that right now.');
        setStatus('open');
        return;
      }

      setStatus('sent');
    } catch {
      setError('Unable to send that right now.');
      setStatus('open');
    }
  };

  if (status === 'sent') {
    return (
      <p className="text-xs text-zinc-500">
        Thanks - that went to {who}. Only they can see it.
      </p>
    );
  }

  if (status === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStatus('open')}
        className="text-xs text-zinc-500 underline decoration-dotted underline-offset-4 transition hover:text-zinc-300"
      >
        Something off with this question?
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs text-zinc-400">
      <p>
        Let {who} know what looked wrong? Only they will see this, and it is never shown publicly.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {REPORT_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            disabled={status === 'sending'}
            onClick={() => send(reason)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-medium text-zinc-300 transition hover:border-violet-400/40 hover:text-white disabled:opacity-50"
          >
            {REPORT_REASON_LABELS[reason]}
          </button>
        ))}
      </div>

      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
          className="h-3.5 w-3.5"
        />
        Send anonymously
      </label>

      {error ? <p className="mt-2 text-rose-300">{error}</p> : null}

      <button
        type="button"
        onClick={() => {
          setStatus('idle');
          setError('');
        }}
        className="mt-2 text-zinc-500 underline decoration-dotted underline-offset-4 transition hover:text-zinc-300"
      >
        Never mind
      </button>
    </div>
  );
}