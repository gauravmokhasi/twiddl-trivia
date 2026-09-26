import { NextResponse } from 'next/server';
import { createRouteSupabase } from '@/lib/supabase-server';
import { reviewQuestionForAiAssist } from '@/lib/ai-assist';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, questionType, choices, correctAnswerIndex, correctAnswer } = body;

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

    const review = await reviewQuestionForAiAssist({
      text,
      questionType,
      choices: Array.isArray(choices) ? choices : [],
      correctAnswerIndex: typeof correctAnswerIndex === 'number' ? correctAnswerIndex : -1,
      correctAnswer: typeof correctAnswer === 'string' ? correctAnswer : null,
    });

    return NextResponse.json(review);
  } catch (error) {
    console.error('[aiAssist] review failed open', error);
    return NextResponse.json({
      assessment: 'OKAY',
      suggestedQuestion: null,
      shortReason: null,
    });
  }
}
