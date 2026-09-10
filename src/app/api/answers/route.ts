import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAnswerCorrect } from '@/lib/answer-checker';
import type { Database } from '@/lib/database.types';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const questionId = url.searchParams.get('questionId');

  if (!questionId) {
    return NextResponse.json({ error: 'questionId is required.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ hasAnswered: false });
  }

  const { data: answerData, error } = await supabaseAdmin
    .from('answers')
    .select('id, selected_choice_index, answer_text, is_correct, question_id')
    .eq('question_id', questionId)
    .eq('responder_id', session.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const answer = answerData as {
    selected_choice_index: number | null;
    answer_text: string | null;
    is_correct: boolean;
  } | null;

  if (!answer) {
    return NextResponse.json({ hasAnswered: false });
  }

  const { data: questionData } = await supabaseAdmin
    .from('questions')
    .select('correct_answer_index, question_type, correct_answer')
    .eq('id', questionId)
    .single();
  const question = questionData as { correct_answer_index: number } | null;

  return NextResponse.json({
    hasAnswered: true,
    selectedChoiceIndex: answer.selected_choice_index,
    answerText: answer.answer_text,
    isCorrect: answer.is_correct,
    correctAnswerIndex: question?.correct_answer_index ?? answer.selected_choice_index,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { questionId, selectedChoiceIndex, answerText } = body;

  if (!questionId) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabase = await createRouteSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { data: questionData, error: questionError } = await supabaseAdmin
    .from('questions')
    .select('id, author_id, correct_answer_index, question_type, correct_answer')
    .eq('id', questionId)
    .single();
  const question = questionData as {
    id: string;
    author_id: string;
    correct_answer_index: number;
    question_type: 'multiple_choice' | 'free_text';
    correct_answer: string | null;
  } | null;

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  }

  // Prevent users from answering their own questions
  if (question.author_id === session.user.id) {
    return NextResponse.json({ error: 'You cannot answer your own question.' }, { status: 403 });
  }

  if (question.question_type === 'multiple_choice' && (typeof selectedChoiceIndex !== 'number' || selectedChoiceIndex < 0)) {
    return NextResponse.json({ error: 'Please select one of the answer choices.' }, { status: 400 });
  }

  if (question.question_type === 'free_text' && (typeof answerText !== 'string' || !answerText.trim())) {
    return NextResponse.json({ error: 'Please enter an answer.' }, { status: 400 });
  }

  const { data: existingAnswerData } = await supabaseAdmin
    .from('answers')
    .select('id, selected_choice_index, is_correct')
    .eq('question_id', questionId)
    .eq('responder_id', session.user.id)
    .maybeSingle();
  const existingAnswer = existingAnswerData as {
    selected_choice_index: number | null;
    answer_text: string | null;
    is_correct: boolean;
  } | null;

  if (existingAnswer) {
    return NextResponse.json({
      hasAnswered: true,
      selectedChoiceIndex: existingAnswer.selected_choice_index,
      answerText: existingAnswer.answer_text,
      isCorrect: existingAnswer.is_correct,
      correctAnswerIndex: question.correct_answer_index,
    }, { status: 200 });
  }

  const isCorrect = question.question_type === 'free_text'
    ? isAnswerCorrect(answerText.trim(), question.correct_answer ?? '')
    : selectedChoiceIndex === question.correct_answer_index;
  const answerPayload = {
    question_id: questionId,
    responder_id: session.user.id,
    selected_choice_index: question.question_type === 'multiple_choice' ? selectedChoiceIndex : null,
    answer_text: question.question_type === 'free_text' ? answerText.trim() : null,
    is_correct: isCorrect,
  } as Database['public']['Tables']['answers']['Insert'];
  const { error: insertError } = await (supabaseAdmin.from('answers') as any).insert(answerPayload);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    hasAnswered: true,
    isCorrect,
    selectedChoiceIndex: question.question_type === 'multiple_choice' ? selectedChoiceIndex : null,
    answerText: question.question_type === 'free_text' ? answerText.trim() : null,
    correctAnswerIndex: question.correct_answer_index,
  });
}
