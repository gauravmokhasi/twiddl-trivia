import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { unansweredSessionQuestions } from '@/lib/session-questions';

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user?.id) {
      return NextResponse.json({ hasUnanswered: false, question: null });
    }

    const unanswered = await unansweredSessionQuestions({
      userId: user.id,
      publicOnly: true,
    });

    if (unanswered.length === 0) {
      return NextResponse.json({ hasUnanswered: false, question: null });
    }

    // Return the first unanswered public question
    const question = unanswered[0];

    return NextResponse.json({ hasUnanswered: true, question });
  } catch (error) {
    console.error('Error fetching available question:', error);
    return NextResponse.json({ hasUnanswered: false, question: null });
  }
}