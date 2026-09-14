'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

type Props = {
  /** Called after the question is created so the caller can jump straight into the answering flow. */
  onAsked?: () => void;
};

export default function DailyQuestionComposer({ onAsked }: Props) {
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'free_text'>('multiple_choice');
  const [choices, setChoices] = useState(['', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleChoiceChange = (index: number, value: string) => {
    setChoices((current) => current.map((choice, idx) => (idx === index ? value : choice)));
  };

  const handleAddChoice = () => setChoices((current) => [...current, '']);

  const handleRemoveChoice = (index: number) => {
    if (choices.length <= 2) return;
    setChoices((current) => current.filter((_, idx) => idx !== index));
    setCorrectAnswerIndex((current) => (current === index ? 0 : current > index ? current - 1 : current));
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

    setIsSaving(true);

    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
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

    if (onAsked) {
      onAsked();
      return;
    }

    setMessage('Question created successfully! Your followers will see it in the next 24-hour feed.');
  };
  return (
    <div className="space-y-6 pt-6">
      <section className="card mx-auto max-w-2xl p-6 md:p-8">
        <p className="eyebrow">Today&apos;s twiddl</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Ask your question.</h2>
        <p className="mt-2 text-zinc-400">One question a day. Make it a good one.</p>

        {!session ? (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            Please <Link href="/login" className="text-violet-300 underline">sign in</Link> to ask a question.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
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
                onChange={(event) => setText(event.target.value)}
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
                      onChange={() => setCorrectAnswerIndex(index)}
                      className="h-4 w-4"
                    />
                    <span className="text-zinc-400">{String.fromCharCode(65 + index)}</span>
                  </label>
                  <input
                    type="text"
                    value={choice}
                    onChange={(event) => handleChoiceChange(index, event.target.value)}
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
                  onChange={(event) => setCorrectAnswer(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
                  placeholder="Paris, City of Light"
                />
                <span className="mt-1 block text-xs text-zinc-500">Separate accepted aliases with commas. There is also some inbuilt smart matching that will on a best effort accommodate things like abbreviations, minor typos, punctuation, etc.</span>
              </label>
            )}

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