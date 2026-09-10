import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { answerQuestionAsBot, ensureTwiddlBot } from '@/lib/twiddl-bot';

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

  const { data: existingQuestionsData, error: queryError } = await supabaseAdmin
    .from('questions')
    .select('id, created_at')
    .eq('author_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1);
  const existingQuestions = existingQuestionsData as { id: string; created_at: string }[] | null;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const latestQuestion = existingQuestions?.[0];
  if (latestQuestion) {
    const lastCreated = new Date(latestQuestion.created_at).getTime();
    const diffHours = (Date.now() - lastCreated) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return NextResponse.json({ error: 'You can only ask one question every 24 hours.' }, { status: 403 });
    }
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
    await ensureTwiddlBot();
    if (insertedQuestion) await answerQuestionAsBot(insertedQuestion);
  } catch (botError) {
    return NextResponse.json({ error: botError instanceof Error ? botError.message : 'Unable to record twiddlBot answer.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
