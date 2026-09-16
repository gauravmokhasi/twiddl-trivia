'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import QuestionAnswerForm, { type AnswerOutcome } from '@/components/QuestionAnswerForm';
import { formatRelativeDate } from '@/lib/utils';
import type { SessionQuestion } from '@/lib/session-questions';

type EndState = {
  eyebrow?: string;
  title?: string;
  message?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

type Props = {
  questions: SessionQuestion[];
  /** Small label above the question, for example "Explore". */
  headerLabel?: string;
  /** Copy and links for the end-of-queue screen. */
  endState?: EndState;
};

const DEFAULT_END_STATE = {
  eyebrow: 'All caught up',
  title: "You're caught up.",
  message: "You've answered everything in your 24-hour feed.",
  primaryLabel: 'Check out other users',
  primaryHref: '/universe',
  secondaryLabel: 'Explore unanswered questions',
  secondaryHref: '/explore',
};

type Phase = 'fresh' | 'second' | 'done';

export default function TriviaSession({ questions, headerLabel = "Today's twiddl", endState }: Props) {
  const [phase, setPhase] = useState<Phase>(questions.length > 0 ? 'fresh' : 'done');
  const [plan, setPlan] = useState<string[]>(() => questions.map((question) => question.id));
  const [cursor, setCursor] = useState(0);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);

  const questionsById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  // fresh queue -> passed questions (second chance) -> done. Coming back to a passed
  // question never adds it a second time, so the session cannot loop forever.
  const advance = (passedCurrent: boolean) => {
    setOutcome(null);

    const currentId = plan[cursor];
    const nextPassed = passedCurrent && phase === 'fresh' && currentId && !passedIds.includes(currentId)
      ? [...passedIds, currentId]
      : passedIds;

    if (nextPassed !== passedIds) {
      setPassedIds(nextPassed);
    }

    if (cursor + 1 < plan.length) {
      setCursor(cursor + 1);
      return;
    }

    if (phase === 'fresh' && nextPassed.length > 0) {
      setPhase('second');
      setPlan(nextPassed);
      setCursor(0);
      return;
    }

    setPhase('done');
  };

  const currentQuestion = phase === 'done' ? null : questionsById.get(plan[cursor] ?? '') ?? null;

  if (!currentQuestion) {
    const end = { ...DEFAULT_END_STATE, ...endState };

    return (
      <section className="mx-auto max-w-2xl space-y-4 pt-12 text-center">
        <p className="eyebrow">{end.eyebrow}</p>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">{end.title}</h2>
        <p className="text-zinc-400">{end.message}</p>
        <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center">
          <Link className="button button-primary w-full sm:w-auto" href={end.primaryHref}>{end.primaryLabel}</Link>
          <Link className="button button-secondary w-full sm:w-auto" href={end.secondaryHref}>{end.secondaryLabel}</Link>
        </div>
        <p className="text-sm text-zinc-500">People you discover may have older unanswered questions waiting on their profiles.</p>
      </section>
    );
  }

  const isSecondChance = phase === 'second';
  const pickedText = outcome
    ? outcome.answerText ?? (outcome.selectedChoiceIndex !== null ? currentQuestion.choices[outcome.selectedChoiceIndex] ?? null : null)
    : null;
  return (
    <section className="mx-auto max-w-3xl space-y-5 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isSecondChance ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge badge-neutral">Second chance</span>
            <span className="text-xs text-zinc-500">You passed this one earlier.</span>
          </div>
        ) : (
          <p className="eyebrow">{headerLabel}</p>
        )}
        <span className="text-xs font-semibold text-zinc-500">{plan.length - cursor} left</span>
      </div>

      <article className="card group relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl transition group-hover:bg-violet-500/20" />
        <div className="relative flex items-center justify-between gap-3">
          <Link href={`/profile/${currentQuestion.author_username}`} className="flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-200">{currentQuestion.author_username.charAt(0).toUpperCase()}</span>
            @{currentQuestion.author_username} asked
          </Link>
          <span className="text-xs text-zinc-500">{formatRelativeDate(currentQuestion.created_at)}</span>
        </div>
        <p className="relative mt-8 text-3xl font-bold leading-tight tracking-tight text-zinc-50 md:text-4xl">{currentQuestion.text}</p>
      </article>

      {outcome ? (
        <div className={`animate-pop rounded-2xl border p-5 md:p-6 ${outcome.isCorrect ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10'}`}>
          <p className={`text-xl font-bold tracking-tight ${outcome.isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
            {outcome.isCorrect ? '✓ Correct' : '✕ Not quite'}
          </p>
          {pickedText ? (
            <p className="mt-2 text-sm text-zinc-300">Your answer: <span className="font-semibold text-zinc-100">{pickedText}</span></p>
          ) : null}
          {!outcome.isCorrect && outcome.correctText ? (
            <p className="mt-2 text-sm text-zinc-300">The correct answer was <span className="font-semibold text-zinc-100">{outcome.correctText}</span>.</p>
          ) : null}
          <button type="button" className="button button-primary mt-5" onClick={() => advance(false)}>
            Continue
          </button>
        </div>
      ) : (
        <>
          <div className="card p-5 md:p-6">
            <QuestionAnswerForm
              key={currentQuestion.id}
              question={currentQuestion}
              authorId={currentQuestion.author_id}
              onResult={setOutcome}
              skipExistingAnswerCheck
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="button button-ghost text-sm" onClick={() => advance(true)}>
              Pass
            </button>
            <p className="text-xs text-zinc-500">Passing keeps this one out of today&apos;s queue until you finish the rest.</p>
          </div>
        </>
      )}
    </section>
  );
}