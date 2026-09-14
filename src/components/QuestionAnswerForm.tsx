'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Question } from '@/lib/database.types';

export type AnswerOutcome = {
  isCorrect: boolean;
  selectedChoiceIndex: number | null;
  answerText: string | null;
  correctText: string | null;
};

type Props = {
  question: Question;
  authorId: string;
  /** When provided, the parent owns the result UI (used by the one-question-at-a-time flow). */
  onResult?: (outcome: AnswerOutcome) => void;
  /** Skip the "already answered" lookup when the caller already filtered answered questions. */
  skipExistingAnswerCheck?: boolean;
};

export default function QuestionAnswerForm({ question, authorId, onResult, skipExistingAnswerCheck }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const { session } = useAuth();
  const isAuthor = session?.user?.id === authorId;

  useEffect(() => {
    if (isAuthor || skipExistingAnswerCheck) return;

    const loadExistingAnswer = async () => {
      if (!session?.user?.id) return;

      const response = await fetch(`/api/answers?questionId=${question.id}`);
      const data = await response.json();

      if (!response.ok || !data?.hasAnswered) {
        return;
      }

      const correctText = question.correct_answer ?? question.choices[data.correctAnswerIndex];
      setSelectedIndex(data.selectedChoiceIndex ?? null);
      setAnswerText(data.answerText ?? '');
      setIsLocked(true);
      setStatusMessage(
        data.isCorrect
          ? `You already answered this question. Your answer was correct${question.question_type === 'free_text' ? `: ${data.answerText ?? ''}` : `: ${question.choices[data.selectedChoiceIndex]}`}.`
          : `You already answered this question. Your answer was incorrect. The correct answer is: ${correctText}.`
      );
    };

    loadExistingAnswer();
  }, [question, session, isAuthor, skipExistingAnswerCheck]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);

    if (!session?.user?.id) {
      setStatusMessage('Please sign in before submitting your answer.');
      return;
    }

    if (question.question_type === 'multiple_choice' && selectedIndex === null) {
      setStatusMessage('Please select an answer before submitting.');
      return;
    }

    if (question.question_type === 'free_text' && !answerText.trim()) {
      setStatusMessage('Please enter an answer before submitting.');
      return;
    }

    setIsSubmitting(true);

    const response = await fetch('/api/answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId: question.id,
        selectedChoiceIndex: selectedIndex,
        answerText: question.question_type === 'free_text' ? answerText.trim() : null,
      }),
    });

    const data = await response.json();
    setIsSubmitting(false);

    if (!response.ok) {
      setStatusMessage(data?.error || 'Unable to submit answer.');
      return;
    }

    setIsLocked(true);

    if (onResult) {
      onResult({
        isCorrect: Boolean(data.isCorrect),
        selectedChoiceIndex: data.selectedChoiceIndex ?? null,
        answerText: data.answerText ?? null,
        correctText: question.correct_answer ?? question.choices[data.correctAnswerIndex] ?? null,
      });
      return;
    }

    if (data.isCorrect) {
      setStatusMessage(question.question_type === 'free_text'
        ? 'Nice! Your answer is correct.'
        : `Nice! Your answer is correct. You chose: ${question.choices[data.selectedChoiceIndex]}.`);
    } else {
      const correctText = question.correct_answer ?? question.choices[data.correctAnswerIndex];
      setStatusMessage(`That answer is not correct. The correct answer is: ${correctText}.`);
    }
  };

  if (isAuthor) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
          You cannot answer your own question.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold text-zinc-200">Choose the answer below</legend>

        {question.question_type === 'free_text' ? (
          <input
            type="text"
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            disabled={isLocked}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 focus:border-sky-500 focus:outline-none"
            placeholder="Type your answer"
          />
        ) : question.choices.map((choice, index) => (
          <label key={choice} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 transition hover:border-violet-400/50 hover:bg-violet-500/[0.06]">
            <input
              type="radio"
              name="answer"
              value={index}
              checked={selectedIndex === index}
              onChange={() => setSelectedIndex(index)}
              disabled={isLocked}
              className="h-4 w-4 text-sky-600"
            />
            <span className="text-zinc-300">{String.fromCharCode(65 + index)}. {choice}</span>
          </label>
        ))}
      </fieldset>

      {statusMessage ? (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-zinc-300">{statusMessage}</div>
      ) : null}

      <button type="submit" className="button button-primary" disabled={isSubmitting || isLocked}>
        {isLocked ? 'Answer locked in' : isSubmitting ? 'Submitting...' : 'Submit answer'}
      </button>
    </form>
  );
}
