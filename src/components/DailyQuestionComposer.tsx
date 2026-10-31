'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import type { AiAssistAccuracyConcern, AiAssistResult } from '@/lib/twiddl-assist';
import {
  COACHING_STORAGE_KEY,
  getStoredCoachingPreference,
  getStoredFactCheckPreference,
  setStoredFactCheckPreference,
} from '@/lib/twiddl-assist-preferences';
import { buildChoicePayload } from '@/lib/question-choices';
import { GUIDANCE_PRINCIPLES } from '@/lib/question-guidance';

type Props = {
  /** Called after the question is created so the caller can jump straight into the answering flow. */
  onAsked?: () => void;
};

const GUIDANCE_STORAGE_KEY = 'twiddl-guidance-visible';

function getStoredGuidancePreference() {
  if (typeof window === 'undefined') return true;

  try {
    // Absence means visible: the panel only disappears once the author hides it.
    return window.localStorage.getItem(GUIDANCE_STORAGE_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function AssistToggle({ pressed, onToggle, label }: { pressed: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${label}: ${pressed ? 'on' : 'off'}`}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${pressed ? 'border-violet-400/60 bg-violet-500/80' : 'border-white/15 bg-zinc-700'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${pressed ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

export default function DailyQuestionComposer({ onAsked }: Props) {
  const { session } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'free_text'>('multiple_choice');
  const [choices, setChoices] = useState(['', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(0);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // localStorage is client-only: lazy initializers run only on the client, so
  // SSR keeps the defaults and never mismatches a persisted "hidden"/"off".
  const [guidanceVisible, setGuidanceVisible] = useState<boolean>(() => getStoredGuidancePreference());
  const [coachingEnabled, setCoachingEnabled] = useState<boolean>(() => getStoredCoachingPreference());
  const [aiAssistReview, setAiAssistReview] = useState<AiAssistResult | null>(null);
  // No toggle on this screen by design: the check runs quietly unless it is
  // confident, and is only ever switched off from an accuracy card or the
  // profile page. Defaults on; the profile toggle writes the same key.
  const [factCheckEnabled, setFactCheckEnabled] = useState<boolean>(() => getStoredFactCheckPreference());
  const [accuracyConcern, setAccuracyConcern] = useState<AiAssistAccuracyConcern | null>(null);
  const [accuracyDismissed, setAccuracyDismissed] = useState(false);
  // Twiddl Assist is deliberately a single pass per question: once it has reviewed, later edits
  // (including accepting a suggestion) are submitted as-is rather than reviewed again.
  const [hasRunAiAssist, setHasRunAiAssist] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(COACHING_STORAGE_KEY, String(coachingEnabled));
    } catch {
      // Preference simply does not persist (e.g. private browsing).
    }
  }, [coachingEnabled]);

  useEffect(() => {
    setStoredFactCheckPreference(factCheckEnabled);
  }, [factCheckEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GUIDANCE_STORAGE_KEY, guidanceVisible ? 'visible' : 'hidden');
    } catch {
      // Preference simply does not persist (e.g. private browsing).
    }
  }, [guidanceVisible]);

  // Any edit to the draft invalidates both results, so they are always cleared together.
  const clearAssistReview = () => {
    setAiAssistReview(null);
    setAccuracyConcern(null);
    setAccuracyDismissed(false);
  };

  const handleChoiceChange = (index: number, value: string) => {
    setChoices((current) => current.map((choice, idx) => (idx === index ? value : choice)));
    clearAssistReview();
  };

  const handleAddChoice = () => {
    setChoices((current) => [...current, '']);
    clearAssistReview();
  };

  const handleRemoveChoice = (index: number) => {
    if (choices.length <= 2) return;
    setChoices((current) => current.filter((_, idx) => idx !== index));
    setCorrectAnswerIndex((current) => (current === index ? 0 : current > index ? current - 1 : current));
    clearAssistReview();
  };

  /**
   * Sends the author to the feed after a successful post. Preferred path is
   * onAsked (the home flow flips straight into answering); otherwise the
   * composer navigates itself so the author never sits on a form whose next
   * submit can only be refused by the daily limit.
   */
  const moveToFeed = () => {
    if (onAsked) {
      onAsked();
      return;
    }
    router.push('/');
    router.refresh();
  };

  const submitQuestion = async (questionText: string, imageFile: File | null) => {
    if (!session) {
      setMessage('Please sign in before asking a question.');
      return;
    }

    if (!questionText.trim()) {
      setMessage('Question text cannot be empty.');
      return;
    }

    // Blank rows are dropped, so the ticked option has to be remapped to keep pointing at itself.
    const choicePayload = buildChoicePayload(choices, correctAnswerIndex);
    if (questionType === 'multiple_choice' && choicePayload.choices.length < 2) {
      setMessage('Please provide at least two answer choices.');
      return;
    }

    if (questionType === 'free_text' && !correctAnswer.trim()) {
      setMessage('Please provide the correct answer. You can add aliases separated by commas.');
      return;
    }

    if (imageFile && imageFile.size > 1024 * 1024) {
      setMessage('Image must be 1 MB or smaller.');
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('text', questionText.trim());
      formData.append('questionType', questionType);
      formData.append(
        'choices',
        JSON.stringify(questionType === 'multiple_choice' ? choicePayload.choices : []),
      );
      formData.append(
        'correctAnswerIndex',
        String(questionType === 'multiple_choice' ? choicePayload.correctAnswerIndex : -1),
      );
      formData.append(
        'correctAnswer',
        questionType === 'free_text' ? correctAnswer.trim() : '',
      );
      formData.append('isPublic', 'true');
      if (imageFile) formData.append('image', imageFile);

      const response = await fetch('/api/questions', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);
      setIsSaving(false);

      if (!response.ok) {
        // The daily limit means the question is already saved: another submit
        // could only ever be refused, so go to the feed instead of idling here.
        if (data?.alreadyAsked) {
          moveToFeed();
          return;
        }
        setMessage(data?.error || 'Unable to create your question.');
        return;
      }

      setText('');
      setQuestionType('multiple_choice');
      setChoices(['', '']);
      setCorrectAnswerIndex(0);
      setCorrectAnswer('');
      setImage(null);
      setImagePreview(null);
      clearAssistReview();
      // A new question is starting, so the next one gets its own single Twiddl Assist pass.
      setHasRunAiAssist(false);

      moveToFeed();
    } catch {
      setIsSaving(false);
      setMessage('Unable to create your question.');
    }
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

    const choicePayload = buildChoicePayload(choices, correctAnswerIndex);
    if (questionType === 'multiple_choice' && choicePayload.choices.length < 2) {
      setMessage('Please provide at least two answer choices.');
      return;
    }

    if (questionType === 'multiple_choice' && choicePayload.correctAnswerIndex < 0) {
      setMessage('Please fill in the choice you marked as correct.');
      return;
    }

    if (questionType === 'free_text' && !correctAnswer.trim()) {
      setMessage('Please provide the correct answer. You can add aliases separated by commas.');
      return;
    }

    // Twiddl Assist gets exactly one pass per question. Once it has run, the text is submitted as it
    // stands (an accepted suggestion or a manual edit is never reviewed a second time).
    if ((coachingEnabled || factCheckEnabled) && !hasRunAiAssist) {
      setHasRunAiAssist(true);

      try {
        const response = await fetch('/api/twiddl-assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.trim(),
            questionType,
            choices: questionType === 'multiple_choice' ? choicePayload.choices : [],
            correctAnswerIndex: questionType === 'multiple_choice' ? choicePayload.correctAnswerIndex : -1,
            correctAnswer: questionType === 'free_text' ? correctAnswer.trim() : null,
            // Each check is switchable, and neither is paid for when it is switched off.
            coaching: coachingEnabled,
            factCheck: factCheckEnabled,
          }),
        });

        if (response.ok) {
          const review = (await response.json()) as AiAssistResult;
          setAiAssistReview(review);
          setAccuracyConcern(review.accuracy ?? null);
          setAccuracyDismissed(false);

          // Hold the post while the author decides. Both cards offer a way to override, so nothing
          // here can stop a question being asked.
          if (review.assessment === 'NEEDS_REFRAME' && review.suggestedQuestion) {
            return;
          }

          if (review.accuracy) {
            return;
          }
        } else {
          clearAssistReview();
        }
      } catch {
        clearAssistReview();
      }
    }

    await submitQuestion(text, image);
  };

  const handleUseSuggestion = () => {
    if (!aiAssistReview || aiAssistReview.assessment !== 'NEEDS_REFRAME' || !aiAssistReview.suggestedQuestion) return;
    setText(aiAssistReview.suggestedQuestion);
    // The rewrite settles the coaching card only. An accuracy doubt is about the intended answer,
    // which a rewrite preserves by design, so that card stays up to be answered on its own terms.
    setAiAssistReview(null);
    setMessage('');
  };

  /**
   * Dismisses the rewrite advice. When an accuracy doubt is also on screen the post is still held,
   * so the more serious check gets an explicit decision instead of being brushed past.
   */
  const handleKeepMine = async () => {
    setAiAssistReview(null);
    setMessage('');
    if (accuracyConcern) return;
    await submitQuestion(text, image);
  };

  /** The author accepted the accuracy hunch and wants to change the question themselves. */
  const handleEditAfterConcern = () => {
    setAccuracyConcern(null);
    setAccuracyDismissed(true);
    setMessage('');
  };

  /**
   * The author overrode the hunch: the question goes out exactly as written, so any rewrite advice
   * is moot and both cards close together.
   */
  const handlePostAnyway = async () => {
    setAccuracyConcern(null);
    setAccuracyDismissed(true);
    setAiAssistReview(null);
    setMessage('');
    await submitQuestion(text, image);
  };

  /** The hunch was unwanted: silence the check for good. It can be re-enabled from the profile page. */
  const handleTurnOffAccuracyCheck = () => {
    setFactCheckEnabled(false);
    setAccuracyConcern(null);
    setAccuracyDismissed(true);
    setMessage('');
  };

  return (
    <div className="space-y-6 pt-6">
      <section className="card mx-auto max-w-2xl p-6 md:p-8">
        <p className="eyebrow">Today&apos;s twiddl</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Ask your question.</h2>
        <p className="mt-2 text-zinc-400">One question a day. Make it a good one.</p>

        {guidanceVisible ? (
          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="eyebrow">What makes a good question</p>
              <button
                type="button"
                onClick={() => setGuidanceVisible(false)}
                aria-label="Hide question guidance"
                className="shrink-0 text-xs font-semibold text-zinc-500 transition hover:text-zinc-200"
              >
                Hide ✕
              </button>
            </div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400 marker:text-violet-400/70">
              {GUIDANCE_PRINCIPLES.filter((principle) => principle.showInComposer).map((principle) => (
                <li key={principle.title}>
                  <span className="font-semibold text-zinc-200">{principle.title}</span> {principle.short}
                </li>
              ))}
            </ul>
            <Link href="/how-to-write-a-question" className="mt-3 inline-block text-sm font-semibold text-violet-300 transition hover:text-violet-200">
              Read the full guide →
            </Link>
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-500">
            Need inspiration?{' '}
            <Link href="/how-to-write-a-question" className="font-semibold text-violet-300 transition hover:text-violet-200">
              Read what makes a good question →
            </Link>
          </p>
        )}

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
                onChange={(event) => {
                  setText(event.target.value);
                  clearAssistReview();
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
                        clearAssistReview();
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
                    clearAssistReview();
                  }}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 focus:outline-none"
                  placeholder="Paris, City of Light"
                />
                <span className="mt-1 block text-xs text-zinc-500">Separate accepted aliases with commas. There is also some inbuilt smart matching that will on a best effort accommodate things like abbreviations, minor typos, punctuation, etc.</span>
              </label>
            )}

            {/*
              Twiddl Assist sits with the inputs it reviews: below the answer choices (or the
              free-text answer box) and above the cards it produces, so the toggle never pushes
              the submit button off the bottom of the form.
            */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Twiddl Assist</p>
                  <p className="mt-1 text-xs text-zinc-400">Optional guidance to make the question more fun to solve.</p>
                </div>
                <AssistToggle
                  pressed={coachingEnabled}
                  onToggle={() => setCoachingEnabled((value) => !value)}
                  label="Question coaching"
                />
              </div>

              {coachingEnabled ? (
                <p className="text-xs text-amber-300/90">
                  Twiddl Assist can occasionally get things wrong. Please check the question and the correct answer yourself before posting.
                </p>
              ) : null}
            </div>

            {aiAssistReview && aiAssistReview.assessment === 'NEEDS_REFRAME' && aiAssistReview.suggestedQuestion ? (
              <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4 text-sm text-violet-100">
                <p className="font-medium">Want to make this more fun to solve?</p>
                <p className="mt-2 rounded-xl border border-violet-400/20 bg-zinc-950/60 p-3 text-zinc-100">
                  {aiAssistReview.suggestedQuestion}
                </p>
                <p className="mt-2 text-xs text-violet-200/80">
                  Twiddl Assist suggestions can occasionally be inaccurate. Check that the rewrite still matches your intended answer before posting.
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

            {/*
              The accuracy hunch. Deliberately quiet: no explainer, no toggle here. It only
              appears when the check was confident, and both paths let the author move on.
              Turning it off here silences it everywhere; the profile page turns it back on.
            */}
            {accuracyConcern && !accuracyDismissed ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-medium">Quick sanity check</p>
                <p className="mt-2">{accuracyConcern.message}</p>
                <p className="mt-2 text-xs text-amber-200/80">
                  This is only a hunch and it can be wrong. You decide what to post.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="button button-secondary" onClick={handleEditAfterConcern}>
                    Let me edit
                  </button>
                  <button type="button" className="button button-primary" onClick={handlePostAnyway}>
                    Post anyway
                  </button>
                  <button type="button" className="button button-ghost text-sm" onClick={handleTurnOffAccuracyCheck}>
                    Turn off accuracy check
                  </button>
                </div>
              </div>
            ) : null}

            {message ? <p className="text-sm text-zinc-300">{message}</p> : null}

            {imagePreview ? (
              <div className="mt-4 flex items-center gap-3">
                <img src={imagePreview} alt="Preview" className="max-h-32 max-w-32 rounded-xl border border-white/[0.12]" />
                <button
                  type="button"
                  className="button button-ghost text-xs"
                  onClick={() => { setImage(null); setImagePreview(null); }}
                >
                  Remove image
                </button>
              </div>
            ) : null}

            <label className="mt-5 block">
              <span className="block text-sm font-medium text-zinc-300 mb-2">Image (optional)</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="mt-1 block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-500/20 hover:file:bg-violet-500/40"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImage(file);
                  if (file) {
                    setImagePreview(URL.createObjectURL(file));
                  } else {
                    setImagePreview(null);
                  }
                }}
              />
            </label>

            <button className="button button-primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Submit question'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}