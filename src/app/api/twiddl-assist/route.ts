import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { checkQuestionAccuracy, combineAiAssistResult, reviewQuestionForAiAssist, type AiAssistReview } from '@/lib/twiddl-assist';

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

    // Both checks run in parallel and are separately switchable. Coaching defaults on
    // (existing clients send no flag), and the accuracy check defaults on too: it stays
    // quiet unless it is confident, so running it costs the author nothing when all is well.
    const wantsCoaching = coaching !== false;
    const wantsFactCheck = factCheck !== false;

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

    // One secret-free line per review so server logs show whether each check
    // ran and whether the accuracy check spoke up (useful when it seems quiet).
    console.log(
      `[twiddlAssist] coaching=${wantsCoaching ? review.assessment : 'off'} factCheck=${wantsFactCheck ? (accuracy ? `concern:${accuracy.kind}` : 'silent') : 'off'}`,
    );

    return NextResponse.json(combineAiAssistResult(review, accuracy));
  } catch (error) {
    console.error('[twiddlAssist] review failed open', error);
    return NextResponse.json({
      assessment: 'OKAY',
      suggestedQuestion: null,
      shortReason: null,
      accuracy: null,
    });
  }
}
