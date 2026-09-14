'use client';

import { useState } from 'react';
import DailyQuestionComposer from '@/components/DailyQuestionComposer';
import TriviaSession, { type SessionQuestion } from '@/components/TriviaSession';

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

  if (!hasAsked) {
    return <DailyQuestionComposer onAsked={() => setHasAsked(true)} />;
  }

  return <TriviaSession questions={questions} />;
}