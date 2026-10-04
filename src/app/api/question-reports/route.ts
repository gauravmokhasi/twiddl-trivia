import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isReportReason } from '@/lib/question-reports';
import type { Database } from '@/lib/database.types';

/**
 * Records one quality report from someone who answered a question incorrectly.
 *
 * The report is only ever read back by the question's author, and the checks below are what keep the
 * feature to its intended shape: you must have answered, you must have answered incorrectly, and you
 * cannot flag your own question.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { questionId, reason, anonymous } = body ?? {};

    if (typeof questionId !== 'string' || !questionId.trim()) {
      return NextResponse.json({ error: 'Question id is required.' }, { status: 400 });
    }

    if (!isReportReason(reason)) {
      return NextResponse.json({ error: 'That reason is not recognised.' }, { status: 400 });
    }

    const supabase = await createRouteSupabase();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const reporterId = session.user.id;

    const { data: questionData, error: questionError } = await supabaseAdmin
      .from('questions')
      .select('id, author_id')
      .eq('id', questionId)
      .single();
    const question = questionData as { id: string; author_id: string } | null;

    if (questionError || !question) {
      return NextResponse.json({ error: 'Question not found.' }, { status: 404 });
    }

    if (question.author_id === reporterId) {
      return NextResponse.json({ error: 'You cannot flag your own question.' }, { status: 400 });
    }

    // A recorded incorrect answer is required, so this can never become a general purpose report
    // button for questions someone merely dislikes.
    const { data: answerData, error: answerError } = await supabaseAdmin
      .from('answers')
      .select('is_correct')
      .eq('question_id', questionId)
      .eq('responder_id', reporterId)
      .single();
    const answer = answerData as { is_correct: boolean } | null;

    if (answerError || !answer) {
      return NextResponse.json({ error: 'Answer this question first.' }, { status: 400 });
    }

    if (answer.is_correct) {
      return NextResponse.json({ error: 'Only an incorrect answer can be flagged.' }, { status: 400 });
    }

    // Duplicates are ignored rather than rejected, so a double tap or a retry cannot fail.
    const reportPayload = {
      question_id: questionId,
      reporter_id: reporterId,
      reason,
      is_anonymous: anonymous === true,
    } as Database['public']['Tables']['question_reports']['Insert'];

    const { error: insertError } = await (supabaseAdmin.from('question_reports') as any)
      .upsert(reportPayload, { onConflict: 'question_id,reporter_id', ignoreDuplicates: true });

    if (insertError) {
      console.error(`[questionReports] insert failed: ${insertError.message}`);
      return NextResponse.json({ error: 'Unable to send that right now.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[questionReports] unexpected failure', error);
    return NextResponse.json({ error: 'Unable to send that right now.' }, { status: 500 });
  }
}