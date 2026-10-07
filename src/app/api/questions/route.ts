import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  MAX_ANSWER_LENGTH,
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  MAX_QUESTION_TEXT,
  readJsonBody,
} from '@/lib/api-guards';
import { rateLimit } from '@/lib/rate-limit';
import { answerQuestionAsTwiddloo, ensureTwiddloo } from '@/lib/twiddloo';
import { getDailyQuestionStatus } from '@/lib/daily-question';
import { canDeleteQuestion } from '@/lib/question-deletion';
import { createQuestionWithSecret } from '@/lib/question-secrets-server';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const limited = rateLimit(`questions:post:${user.id}`, 5, 60 * 1000);
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
  const { text, questionType = 'multiple_choice', choices = [], correctAnswerIndex = -1, correctAnswer, isPublic } = body as {
    text?: unknown;
    questionType?: unknown;
    choices?: unknown;
    correctAnswerIndex?: unknown;
    correctAnswer?: unknown;
    isPublic?: unknown;
  };

  if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_QUESTION_TEXT) {
    return NextResponse.json({ error: `Question text is required (${MAX_QUESTION_TEXT} characters or fewer).` }, { status: 400 });
  }

  if (!['multiple_choice', 'free_text'].includes(questionType as string)) {
    return NextResponse.json({ error: 'Missing question fields.' }, { status: 400 });
  }

  if (questionType === 'multiple_choice') {
    if (
      !Array.isArray(choices)
      || choices.length < 2
      || choices.length > MAX_CHOICES
      || choices.some((choice) => typeof choice !== 'string' || !choice.trim() || choice.trim().length > MAX_CHOICE_LENGTH)
      || typeof correctAnswerIndex !== 'number'
      || !Number.isInteger(correctAnswerIndex)
      || correctAnswerIndex < 0
      || correctAnswerIndex >= choices.length
    ) {
      return NextResponse.json({ error: 'Multiple-choice questions need 2 to 4 short choices and a valid correct answer.' }, { status: 400 });
    }
  }

  if (questionType === 'free_text') {
    if (typeof correctAnswer !== 'string' || !correctAnswer.trim() || correctAnswer.trim().length > MAX_ANSWER_LENGTH) {
      return NextResponse.json({ error: `Free-text questions need a correct answer (${MAX_ANSWER_LENGTH} characters or fewer).` }, { status: 400 });
    }
  }

  const { hasAsked, error: dailyQuestionError } = await getDailyQuestionStatus(user.id);

  if (dailyQuestionError) {
    return NextResponse.json({ error: dailyQuestionError }, { status: 500 });
  }

  if (hasAsked) {
    // alreadyAsked lets the composer move the author to the feed instead of leaving them on a form
    // whose submit can only ever be refused.
    return NextResponse.json({ error: 'You can only ask one question every 24 hours.', alreadyAsked: true }, { status: 403 });
  }

  const { data: insertedQuestion, error: insertError } = await createQuestionWithSecret({
    p_author_id: user.id,
    p_text: text.trim(),
    p_choices: questionType === 'multiple_choice' ? (choices as string[]).map((choice) => choice.trim()) : [],
    p_question_type: questionType as 'multiple_choice' | 'free_text',
    p_is_public: Boolean(isPublic),
    p_correct_answer_index: questionType === 'multiple_choice' ? correctAnswerIndex as number : null,
    p_correct_answer: questionType === 'free_text' ? (correctAnswer as string).trim() : null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // twiddloo's answer is a flourish, not part of the author's post. The question is already saved and
  // has already used up today's allowance, so a twiddloo hiccup is logged rather than reported as a
  // failed post: telling the author it failed makes them retry, and the retry is refused because they
  // have in fact already asked today.
  try {
    await ensureTwiddloo();
    if (insertedQuestion) await answerQuestionAsTwiddloo(insertedQuestion);
  } catch (twiddlooError) {
    console.warn(`[questions] twiddloo did not answer the new question: ${twiddlooError instanceof Error ? twiddlooError.message : String(twiddlooError)}`);
  }

  return NextResponse.json({ success: true });
}

/**
 * Removes one of the viewer's own questions. Answers and quality reports are attached with
 * "on delete cascade", so they go with it rather than being left orphaned.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const questionId = url.searchParams.get('questionId');

  if (!questionId) {
    return NextResponse.json({ error: 'questionId is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();

  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: questionData, error: questionError } = await supabaseAdmin
    .from('questions')
    .select('id, author_id, created_at')
    .eq('id', questionId)
    .single();
  const question = questionData as { id: string; author_id: string; created_at: string } | null;

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  }

  // Author-only, and not while it is still today's question: the daily gate counts the newest
  // question a user asked, so deleting it would hand the 24-hour rule a loophole.
  const verdict = canDeleteQuestion({
    viewerId: user.id,
    authorId: question.author_id,
    createdAt: question.created_at,
  });

  if (!verdict.allowed) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  const { error: deleteError } = await (supabaseAdmin
    .from('questions')
    .delete()
    .eq('id', question.id) as any);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
