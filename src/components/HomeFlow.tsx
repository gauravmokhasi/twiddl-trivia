'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DailyQuestionComposer from '@/components/DailyQuestionComposer';
import TriviaSession from '@/components/TriviaSession';
import type { SessionQuestion } from '@/lib/session-questions';

type Props = {
  hasAskedToday: boolean;
  questions: SessionQuestion[];
};

/**
 * Home routing for signed-in users: ask today's question first, then move straight
 * into the one-question-at-a-time answering flow.
 */
export default function HomeFlow({ hasAskedToday, questions }: Props) {
  const [hasAsked, setHasAsked] = useState(hasAskedToday);
  const router = useRouter();

  const handleAsked = () => {
    setHasAsked(true);
    // The header navigation is rendered by the server layout, so ask it to re-render once the
    // question has been asked and the rest of the app is unlocked.
    router.refresh();
  };

  if (!hasAsked) {
    return <DailyQuestionComposer onAsked={handleAsked} />;
  }

  return <TriviaSession questions={questions} />;
}