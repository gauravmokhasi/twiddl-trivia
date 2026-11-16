import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import type { Database } from '@/lib/database.types';

type AnswerRow = Database['public']['Tables']['answers']['Row'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { markCorrect } = body;

  if (markCorrect !== true) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Fetch the answer and its question in one go.
  const { data: answer, error: answerError } = await supabaseAdmin
    .from('answers')
    .select('*, questions(question_type, author_id)')
    .eq('id', id)
    .single();

  if (answerError || !answer) {
    return NextResponse.json({ error: 'Answer not found.' }, { status: 404 });
  }

  const question = (answer as unknown as { questions?: { question_type: string; author_id: string } })
    .questions;
  if (!question || question.question_type !== 'free_text') {
    return NextResponse.json(
      { error: 'Manual marking is only available for free-text questions.' },
      { status: 400 },
    );
  }

  // Only the question author can manually mark answers correct.
  if (question.author_id !== user.id) {
    return NextResponse.json({ error: 'Only the question author can mark answers correct.' }, { status: 403 });
  }

  const answerText = answer.answer_text;
  if (!answerText) {
    return NextResponse.json({ error: 'Answer has no text to mark.' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Mark the target answer correct.
  const { error: updateError } = await supabaseAdmin
    .from('answers')
    .update({ is_correct: true, marked_correct_by: user.id, marked_correct_at: now })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Unable to mark answer correct.' }, { status: 500 });
  }

  // Auto-mark all other submissions with the same answer text on this question
  // (is_correct only; marked_correct_by stays null so we can tell manual marks apart).
  const { error: bulkError } = await supabaseAdmin
    .from('answers')
    .update({ is_correct: true })
    .eq('question_id', answer.question_id)
    .eq('answer_text', answerText)
    .neq('id', id);

  if (bulkError) {
    return NextResponse.json({ error: 'Unable to update matching answers.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
