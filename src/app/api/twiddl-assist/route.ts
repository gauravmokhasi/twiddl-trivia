import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  MAX_ANSWER_LENGTH,
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  MAX_QUESTION_TEXT,
  readJsonBody,
} from '@/lib/api-guards';
import { rateLimit } from '@/lib/rate-limit';
import { checkQuestionAccuracy, combineAiAssistResult, reviewQuestionForAiAssist, type AiAssistReview } from '@/lib/twiddl-assist';

/** Used when the author has switched question coaching off, so no call is made at all. */
const NO_REVIEW: AiAssistReview = { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const limited = rateLimit(`twiddl-assist:${user.id}`, 10, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
      );
    }

    const body = await readJsonBody(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const { text, questionType, choices, correctAnswerIndex, correctAnswer, coaching, factCheck } = body as {
      text?: unknown;
      questionType?: unknown;
      choices?: unknown;
      correctAnswerIndex?: unknown;
      correctAnswer?: unknown;
      coaching?: unknown;
      factCheck?: unknown;
    };

    if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_QUESTION_TEXT) {
      return NextResponse.json({ error: 'Question text is required.' }, { status: 400 });
    }

    if (questionType !== 'multiple_choice' && questionType !== 'free_text') {
      return NextResponse.json({ error: 'Question type is invalid.' }, { status: 400 });
    }

    // Both checks run in parallel and are separately switchable. Coaching defaults on
    // (existing clients send no flag), and the accuracy check defaults on too: it stays
    // quiet unless it is confident, so running it costs the author nothing when all is well.
    const wantsCoaching = coaching !== false;
    const wantsFactCheck = factCheck !== false;

    const safeChoices = Array.isArray(choices)
      ? choices.filter((choice): choice is string => typeof choice === 'string').map((choice) => choice.slice(0, MAX_CHOICE_LENGTH)).slice(0, MAX_CHOICES)
      : [];
    const safeCorrectAnswer = typeof correctAnswer === 'string' ? correctAnswer.slice(0, MAX_ANSWER_LENGTH) : null;

    const question = {
      text: text.trim(),
      questionType: questionType as 'multiple_choice' | 'free_text',
      choices: safeChoices,
      correctAnswerIndex: typeof correctAnswerIndex === 'number' ? correctAnswerIndex : -1,
      correctAnswer: safeCorrectAnswer,
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
