'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import type { AiAssistReview } from '@/lib/ai-assist';

type Props = {
  /** Called after the question is created so the caller can jump straight into the answering flow. */
  onAsked?: () => void;
};

const AI_ASSIST_STORAGE_KEY = 'twiddl-ai-assist-enabled';

function getStoredAiAssistPreference() {
  if (typeof window === 'undefined') return true;

  try {
    const storedValue = window.localStorage.getItem(AI_ASSIST_STORAGE_KEY);
    if (storedValue === null) return true;
    return storedValue === 'true';
  } catch {
    return true;
  }
}

function buildAiAssistSignature({
  text,
  questionType,
  choices,
  correctAnswerIndex,
  correctAnswer,
}: {
  text: string;
  questionType: 'multiple_choice' | 'free_text';
  choices: string[];
  correctAnswerIndex: number;
  correctAnswer: string;
}) {
  const normalizedText = text.trim();
  const normalizedAnswer = correctAnswer.trim();
  const choiceValue = questionType === 'multiple_choice'
    ? choices.map((choice) => choice.trim()).join('||')
    : '';

  return [normalizedText, questionType, choiceValue, String(correctAnswerIndex), normalizedAnswer].join('::');
}

export default function DailyQuestionComposer({ onAsked }: Props) {
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'free_text'>('multiple_choice');
  const [choices, setChoices] = useState(['', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [aiAssistEnabled, setAiAssistEnabled] = useState<boolean>(getStoredAiAssistPreference);
  const [aiAssistReview, setAiAssistReview] = useState<AiAssistReview | null>(null);
  const [lastReviewedSignature, setLastReviewedSignature] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AI_ASSIST_STORAGE_KEY, String(aiAssistEnabled));
  }, [aiAssistEnabled]);

  const currentReviewSignature = useMemo(
    () => buildAiAssistSignature({
      text,
      questionType,
      choices,
      correctAnswerIndex,
      correctAnswer,
    }),
    [text, questionType, choices, correctAnswerIndex, correctAnswer],
  );

  const handleChoiceChange = (index: number, value: string) => {
    setChoices((current) => current.map((choice, idx) => (idx === index ? value : choice)));
    setAiAssistReview(null);
    setLastReviewedSignature('');
  };

  const handleAddChoice = () => {
    setChoices((current) => [...current, '']);
    setAiAssistReview(null);
    setLastReviewedSignature('');
  };

  const handleRemoveChoice = (index: number) => {
    if (choices.length <= 2) return;
    setChoices((current) => current.filter((_, idx) => idx !== index));
    setCorrectAnswerIndex((current) => (current === index ? 0 : current > index ? current - 1 : current));
    setAiAssistReview(null);
    setLastReviewedSignature('');
  };

  const submitQuestion = async (questionText: string) => {
    if (!session) {
      setMessage('Please sign in before asking a question.');
      return;
    }

    if (!questionText.trim()) {
      setMessage('Question text cannot be empty.');
      return;
    }

    const validChoices = choices.map((choice) => choice.trim()).filter(Boolean);
    if (questionType === 'multiple_choice' && validChoices.length < 2) {
      setMessage('Please provide at least two answer choices.');
      return;
    }

    if (questionType === 'free_text' && !correctAnswer.trim()) {
      setMessage('Please provide the correct answer. You can add aliases separated by commas.');
      return;
    }

    setIsSaving(true);

    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: questionText.trim(),
        questionType,
        choices: questionType === 'multiple_choice' ? validChoices : [],
        correctAnswerIndex: questionType === 'multiple_choice' ? correctAnswerIndex : -1,
        correctAnswer: questionType === 'free_text' ? correctAnswer.trim() : null,
        isPublic: true,
      }),
    });

    const data = await response.json();
    setIsSaving(false);

    if (!response.ok) {
      setMessage(data.error || 'Unable to create your question.');
      return;
    }

    setText('');
    setQuestionType('multiple_choice');
    setChoices(['', '']);
    setCorrectAnswerIndex(0);
    setCorrectAnswer('');
    setAiAssistReview(null);
    setLastReviewedSignature('');

    if (onAsked) {
      onAsked();
      return;
    }

    setMessage('Question created successfully! Your followers will see it in the next 24-hour feed.');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (!session) {
      setMessage('Please sign in before asking a question.');
      return;
    }

    if (!text.trim()) {
      setMessage('Question text cannot be empty.');
      return;
    }

    const validChoices = choices.map((choice) => choice.trim()).filter(Boolean);
    if (questionType === 'multiple_choice' && validChoices.length < 2) {
      setMessage('Please provide at least two answer choices.');
      return;
    }

    if (questionType === 'free_text' && !correctAnswer.trim()) {
      setMessage('Please provide the correct answer. You can add aliases separated by commas.');
      return;
    }

    if (aiAssistEnabled) {
      if (lastReviewedSignature !== currentReviewSignature || !aiAssistReview) {
        try {
          const response = await fetch('/api/ai-assist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text.trim(),
              questionType,
              choices: questionType === 'multiple_choice' ? validChoices : [],
              correctAnswerIndex: questionType === 'multiple_choice' ? correctAnswerIndex : -1,
              correctAnswer: questionType === 'free_text' ? correctAnswer.trim() : null,
            }),
          });

          if (response.ok) {
            const review = (await response.json()) as AiAssistReview;
            setAiAssistReview(review);
            setLastReviewedSignature(currentReviewSignature);

            if (review.assessment === 'NEEDS_REFRAME' && review.suggestedQuestion) {
              return;
            }
          } else {
            setAiAssistReview(null);
            setLastReviewedSignature(currentReviewSignature);
          }
        } catch {
          setAiAssistReview(null);
          setLastReviewedSignature(currentReviewSignature);
        }
      } else if (aiAssistReview?.assessment === 'NEEDS_REFRAME' && aiAssistReview.suggestedQuestion) {
        return;
      }
    }

    await submitQuestion(text);
  };

  const handleUseSuggestion = () => {
    if (!aiAssistReview || aiAssistReview.assessment !== 'NEEDS_REFRAME' || !aiAssistReview.suggestedQuestion) return;
    setText(aiAssistReview.suggestedQuestion);
    setAiAssistReview(null);
    setLastReviewedSignature('');
    setMessage('');
  };

  const handleKeepMine = async () => {
    setAiAssistReview(null);
    setLastReviewedSignature('');
    await submitQuestion(text);
  };

  return (
    <div className="space-y-6 pt-6">
      <section className="card mx-auto max-w-2xl p-6 md:p-8">
        <p className="eyebrow">Today&apos;s twiddl</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Ask your question.</h2>
        <p className="mt-2 text-zinc-400">One question a day. Make it a good one.</p>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 md:p-5">
          <p className="eyebrow">What makes a good question</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400 marker:text-violet-400/70">
            <li><span className="font-semibold text-zinc-200">Give people a way in.</span> Offer clues, not just a fact, so everyone has a fighting chance.</li>
            <li><span className="font-semibold text-zinc-200">Make every clue count.</span> Each clue should bring them closer to the answer.</li>
            <li><span className="font-semibold text-zinc-200">Make solving more fun than knowing.</span> The goal isn&apos;t to stump everyone, it&apos;s the click.</li>
          </ul>
          <Link href="/how-to-write-a-question" className="mt-3 inline-block text-sm font-semibold text-violet-300 transition hover:text-violet-200">
            Read the full guide →
          </Link>
        </div>

        {!session ? (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            Please <Link href="/login" className="text-violet-300 underline">sign in</Link> to ask a question.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div>
                <p className="text-sm font-medium text-zinc-200">AI Assist</p>
                <p className="text-xs text-zinc-400">Optional guidance to make the question more fun to solve.</p>
              </div>
              <button
                type="button"
                aria-pressed={aiAssistEnabled}
                onClick={() => setAiAssistEnabled((value) => !value)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${aiAssistEnabled ? 'border-violet-400/60 bg-violet-500/80' : 'border-white/15 bg-zinc-700'}`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${aiAssistEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-zinc-300">Question type</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={questionType === 'multiple_choice'} onChange={() => setQuestionType('multiple_choice')} />
                Multiple choice
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={questionType === 'free_text'} onChange={() => setQuestionType('free_text')} />
                Free text
              </label>
            </fieldset>

            <label className="block">
              <span className="text-sm font-medium text-zinc-300">Question text</span>
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setAiAssistReview(null);
                  setLastReviewedSignature('');
                }}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
                placeholder="What is your trivia question?"
              />
            </label>

            {questionType === 'multiple_choice' ? <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-300">Answer choices</span>
                <button type="button" className="button button-secondary" onClick={handleAddChoice}>
                  Add choice
                </button>
              </div>

              {choices.map((choice, index) => (
                <div key={index} className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={correctAnswerIndex === index}
                      onChange={() => {
                        setCorrectAnswerIndex(index);
                        setAiAssistReview(null);
                        setLastReviewedSignature('');
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-zinc-400">{String.fromCharCode(65 + index)}</span>
                  </label>
                  <input
                    type="text"
                    value={choice}
                    onChange={(event) => {
                      handleChoiceChange(index, event.target.value);
                    }}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
                    placeholder={`Choice ${String.fromCharCode(65 + index)}`}
                  />
                  {choices.length > 2 ? (
                    <button type="button" className="button button-secondary" onClick={() => handleRemoveChoice(index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div> : (
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Correct answer</span>
                <input
                  type="text"
                  value={correctAnswer}
                  onChange={(event) => {
                    setCorrectAnswer(event.target.value);
                    setAiAssistReview(null);
                    setLastReviewedSignature('');
                  }}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
                  placeholder="Paris, City of Light"
                />
                <span className="mt-1 block text-xs text-zinc-500">Separate accepted aliases with commas. There is also some inbuilt smart matching that will on a best effort accommodate things like abbreviations, minor typos, punctuation, etc.</span>
              </label>
            )}

            {aiAssistReview && aiAssistReview.assessment === 'NEEDS_REFRAME' && aiAssistReview.suggestedQuestion ? (
              <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4 text-sm text-violet-100">
                <p className="font-medium">Want to make this more fun to solve?</p>
                <p className="mt-2 rounded-xl border border-violet-400/20 bg-zinc-950/60 p-3 text-zinc-100">
                  {aiAssistReview.suggestedQuestion}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="button button-primary" onClick={handleUseSuggestion}>
                    Use suggestion
                  </button>
                  <button type="button" className="button button-secondary" onClick={handleKeepMine}>
                    Keep mine
                  </button>
                </div>
              </div>
            ) : null}

            {message ? <p className="text-sm text-zinc-300">{message}</p> : null}

            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Submit question'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}