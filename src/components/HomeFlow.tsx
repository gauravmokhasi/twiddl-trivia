'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DailyQuestionComposer from '@/components/DailyQuestionComposer';
import TriviaSession from '@/components/TriviaSession';
import type { SessionQuestion } from '@/lib/session-questions';

type Props = {
  hasAskedToday: boolean;
  questions: SessionQuestion[];
};

/** Home routing for signed-in users: ask today's question first, then move straight
 * into the one-question-at-a-time answering flow.
 *
 * Option A: Before showing the composer, check if there's a public question (from another user,
 * including twiddloo) that the user hasn't answered. If so, show that question first.
 * If no such question exists, fall back to showing the composer for their own question.
 * Answering a public question does NOT count as 'having asked a question in the last 24 hours'
 * - the user still needs to post their own question via the composer afterward.
 */
export default function HomeFlow({ hasAskedToday, questions }: Props) {
  const [hasAsked, setHasAsked] = useState(hasAskedToday);
  const router = useRouter();

  const [hasPublicQuestion, setHasPublicQuestion] = useState(false);
  const [availableQuestion, setAvailableQuestion] = useState<SessionQuestion | null>(null);

  const handleAsked = () => {
    setHasAsked(true);
    // The header navigation is rendered by the server layout, so ask it to re-render once the
    // question has been asked and the rest of the app is unlocked.
    router.refresh();
  };

  // Fetch available public question from API on mount
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/available-question', {
          cache: 'no-store',
        });
        const data = await res.json();
        setHasPublicQuestion(data.hasUnanswered);
        if (data.question) setAvailableQuestion(data.question);
      } catch (error) {
        console.error('Error fetching available question:', error);
        setHasPublicQuestion(false);
      }
    })();
  }, []);

  if (!hasAsked) {
    // If we have a public question to show, show it first
    if (hasPublicQuestion && availableQuestion) {
      return <TriviaSession
        key={availableQuestion.id}
        questions={[availableQuestion]}
        headerLabel="Available Question"
        endState={{
          eyebrow: 'Answer this question',
          title: 'A question from the community',
          message: 'Here\'s a question from another user that you can answer before posting your own.',
          primaryLabel: 'Back to feed',
          primaryHref: '/',
          secondaryLabel: 'Ask your own question',
          secondaryHref: '/ask',
        }}
      />;
    }

    // No public question available, show the composer for their own question
    return <DailyQuestionComposer onAsked={handleAsked} />;
  }

  // User has already asked today - show the feed
  return <TriviaSession key={questions.map((question) => question.id).join(',')} questions={questions} />;
}