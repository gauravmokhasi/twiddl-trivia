import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { readJsonBody } from '@/lib/api-guards';
import { answeredResult, gradeAnswer, validateAnswer } from '@/lib/answer-grading';
import { loadQuestionSecret } from '@/lib/question-secrets-server';
import type { Database } from '@/lib/database.types';

type Answer = Database['public']['Tables']['answers']['Row'];
const ANSWER_COLUMNS = 'id, selected_choice_index, answer_text, is_correct, question_id';

function resultResponse(data: ReturnType<typeof answeredResult> | { hasAnswered: false }) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'questionId is required.' }, { status: 400 });

  const user = await getAuthenticatedUser();
  if (!user?.id) return resultResponse({ hasAnswered: false });

  const { data, error } = await supabaseAdmin.from('answers').select(ANSWER_COLUMNS)
    .eq('question_id', questionId).eq('responder_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load your answer.' }, { status: 500 });
  // Do not even read the secret until this viewer has an answer on record.
  if (!data) return resultResponse({ hasAnswered: false });

  const { data: question, error: questionError } = await supabaseAdmin.from('questions')
    .select('question_type, choices').eq('id', questionId).single();
  if (questionError || !question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });

  try {
    const secret = await loadQuestionSecret(questionId);
    return resultResponse(answeredResult(question, secret, data as Answer));
  } catch {
    return NextResponse.json({ error: 'Unable to load the answer result.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const { questionId, selectedChoiceIndex, answerText } = body;
  if (typeof questionId !== 'string' || !questionId) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const { data: question, error: questionError } = await supabaseAdmin.from('questions')
    .select('id, author_id, choices, question_type').eq('id', questionId).single();
  if (questionError || !question) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
  if (question.author_id === user.id) {
    return NextResponse.json({ error: 'You cannot answer your own question.' }, { status: 403 });
  }
  const validationError = validateAnswer(question, selectedChoiceIndex, answerText);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data: existingAnswer, error: lookupError } = await supabaseAdmin.from('answers').select(ANSWER_COLUMNS)
    .eq('question_id', questionId).eq('responder_id', user.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Unable to check your previous answer.' }, { status: 500 });

  try {
    const secret = await loadQuestionSecret(questionId);
    if (existingAnswer) return resultResponse(answeredResult(question, secret, existingAnswer as Answer));

    const gradedAnswer = gradeAnswer(question, secret, selectedChoiceIndex, answerText);
    const payload: Database['public']['Tables']['answers']['Insert'] = {
      question_id: questionId,
      responder_id: user.id,
      ...gradedAnswer,
    };
    const { error: insertError } = await supabaseAdmin.from('answers').insert(payload);
    if (insertError) {
      // Two tabs can submit together. The unique constraint chooses the first recorded answer;
      // always return that outcome, never grade the losing request as a second attempt.
      if (insertError.code === '23505') {
        const { data: recorded, error: recordedError } = await supabaseAdmin.from('answers').select(ANSWER_COLUMNS)
          .eq('question_id', questionId).eq('responder_id', user.id).single();
        if (!recordedError && recorded) return resultResponse(answeredResult(question, secret, recorded as Answer));
      }
      return NextResponse.json({ error: 'Unable to save your answer.' }, { status: 500 });
    }
    // An answer key is returned only after the grade has successfully been persisted.
    return resultResponse(answeredResult(question, secret, gradedAnswer));
  } catch {
    return NextResponse.json({ error: 'Unable to grade this answer right now.' }, { status: 500 });
  }
}
