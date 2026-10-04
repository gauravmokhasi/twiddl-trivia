import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { answerQuestionAsTwiddloo, ensureTwiddloo } from '@/lib/twiddloo';
import { getDailyQuestionStatus } from '@/lib/daily-question';
import { canDeleteQuestion } from '@/lib/question-deletion';

export async function POST(request: Request) {
  const body = await request.json();
  const { text, questionType = 'multiple_choice', choices = [], correctAnswerIndex = -1, correctAnswer, isPublic } = body;

  if (!text || !['multiple_choice', 'free_text'].includes(questionType)) {
    return NextResponse.json({ error: 'Missing question fields.' }, { status: 400 });
  }

  if (questionType === 'multiple_choice' && (!Array.isArray(choices) || choices.length < 2 || correctAnswerIndex < 0 || correctAnswerIndex >= choices.length)) {
    return NextResponse.json({ error: 'Multiple-choice questions need at least two choices and a valid correct answer.' }, { status: 400 });
  }

  if (questionType === 'free_text' && (typeof correctAnswer !== 'string' || !correctAnswer.trim())) {
    return NextResponse.json({ error: 'Free-text questions need a correct answer.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { hasAsked, error: dailyQuestionError } = await getDailyQuestionStatus(session.user.id);

  if (dailyQuestionError) {
    return NextResponse.json({ error: dailyQuestionError }, { status: 500 });
  }

  if (hasAsked) {
    return NextResponse.json({ error: 'You can only ask one question every 24 hours.' }, { status: 403 });
  }

  const { data: insertedQuestion, error: insertError } = await (supabaseAdmin.from('questions') as any).insert({
    author_id: session.user.id,
    text,
    choices: questionType === 'multiple_choice' ? choices : [],
    correct_answer_index: questionType === 'multiple_choice' ? correctAnswerIndex : -1,
    question_type: questionType,
    correct_answer: questionType === 'free_text' ? correctAnswer.trim() : null,
    is_public: Boolean(isPublic),
  }).select('id, text, choices, question_type').single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  try {
    await ensureTwiddloo();
    if (insertedQuestion) await answerQuestionAsTwiddloo(insertedQuestion);
  } catch (twiddlooError) {
    return NextResponse.json({ error: twiddlooError instanceof Error ? twiddlooError.message : 'Unable to record twiddloo answer.' }, { status: 500 });
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

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
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
    viewerId: session.user.id,
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
