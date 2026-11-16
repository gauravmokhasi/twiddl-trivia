'use client';

import { useState } from 'react';

type AnswerRow = {
  id: string;
  responder_id: string;
  selected_choice_index: number | null;
  answer_text: string | null;
  is_correct: boolean;
  created_at: string;
};

type Responder = {
  id: string;
  username: string;
  display_name: string | null;
};

interface Props {
  questionType: 'multiple_choice' | 'free_text';
  answerRows: AnswerRow[];
  responderMap: Map<string, Responder>;
  currentUserId: string | null;
  authorId: string;
  choices: string[];
}

export default function AnswerSummary({
  questionType,
  answerRows,
  responderMap,
  currentUserId,
  authorId,
  choices,
}: Props) {
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const isAuthor = currentUserId === authorId;
  const canMark = isAuthor && questionType === 'free_text';

  async function handleMarkCorrect(answer: AnswerRow) {
    if (!answer.answer_text || !canMark || loadingIds.has(answer.id)) return;

    setLoadingIds((prev) => new Set(prev).add(answer.id));
    try {
      const res = await fetch(`/api/answers/${answer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markCorrect: true }),
      });
      if (!res.ok) return;

      setMarkedIds((prev) => {
        const next = new Set(prev);
        next.add(answer.id);
        // Also mark matching answers as correct locally (auto-marked by server).
        for (const row of answerRows) {
          if (row.answer_text === answer.answer_text) next.add(row.id);
        }
        return next;
      });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(answer.id);
        return next;
      });
    }
  }

  if (!answerRows || answerRows.length === 0) {
    return (
      <p className="mt-4 text-slate-700">No one has answered this question yet.</p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {answerRows.map((answer) => {
        const responder = responderMap.get(answer.responder_id);
        const pickedText =
          answer.answer_text ??
          (answer.selected_choice_index === null
            ? 'No answer recorded'
            : choices[answer.selected_choice_index] ?? 'Unknown option');
        const isCorrect = answer.is_correct || markedIds.has(answer.id);
        return (
          <div key={answer.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-zinc-200">
                  {responder?.display_name ?? 'Unknown user'}
                </p>
                <p className="text-xs text-zinc-500">
                  @{responder?.username ?? 'unknown'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${isCorrect ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                  {isCorrect ? 'Correct' : 'Incorrect'}
                </span>
                {canMark &&
                  !isCorrect &&
                  answer.answer_text && (
                  <MarkCorrectButton answer={answer} onMarkCorrect={handleMarkCorrect} loading={loadingIds.has(answer.id)} />
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              {questionType === 'free_text' ? 'Answered' : 'Chose'}:{' '}
              <span className="font-medium">{pickedText}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MarkCorrectButton({
  answer,
  onMarkCorrect,
  loading,
}: {
  answer: AnswerRow;
  onMarkCorrect: (answer: AnswerRow) => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={() => onMarkCorrect(answer)}
      disabled={loading}
      className="badge bg-violet-500/10 text-violet-200 disabled:opacity-50 ml-2 shrink-0"
    >
      {loading ? 'Marking…' : 'Mark correct'}
    </button>
  );
}
