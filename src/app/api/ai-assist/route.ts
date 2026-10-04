import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { checkQuestionAccuracy, combineAiAssistResult, reviewQuestionForAiAssist, type AiAssistReview } from '@/lib/ai-assist';

/** Used when the author has switched question coaching off, so no call is made at all. */
const NO_REVIEW: AiAssistReview = { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, questionType, choices, correctAnswerIndex, correctAnswer, coaching, factCheck } = body;

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Question text is required.' }, { status: 400 });
    }

    if (questionType !== 'multiple_choice' && questionType !== 'free_text') {
      return NextResponse.json({ error: 'Question type is invalid.' }, { status: 400 });
    }

    const supabase = await createRouteSupabase();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    // Both checks are independent and separately switchable. Coaching defaults on (existing clients
    // send no flag); the accuracy check defaults off so nobody pays for it before opting in.
    const wantsCoaching = coaching !== false;
    const wantsFactCheck = factCheck === true;

    const question = {
      text,
      questionType,
      choices: Array.isArray(choices) ? choices : [],
      correctAnswerIndex: typeof correctAnswerIndex === 'number' ? correctAnswerIndex : -1,
      correctAnswer: typeof correctAnswer === 'string' ? correctAnswer : null,
    };

    // Run in parallel so the accuracy check costs the author no extra waiting time. Nothing is
    // written here, so a failure in either one simply means that check stays quiet.
    const [review, accuracy] = await Promise.all([
      wantsCoaching ? reviewQuestionForAiAssist(question) : Promise.resolve(NO_REVIEW),
      wantsFactCheck ? checkQuestionAccuracy(question) : Promise.resolve(null),
    ]);

    return NextResponse.json(combineAiAssistResult(review, accuracy));
  } catch (error) {
    console.error('[aiAssist] review failed open', error);
    return NextResponse.json({
      assessment: 'OKAY',
      suggestedQuestion: null,
      shortReason: null,
      accuracy: null,
    });
  }
}
