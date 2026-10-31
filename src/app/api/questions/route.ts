import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import {
  MAX_ANSWER_LENGTH,
  MAX_CHOICES,
  MAX_CHOICE_LENGTH,
  MAX_QUESTION_TEXT,
} from '@/lib/api-guards';
import { rateLimit } from '@/lib/rate-limit';
import { answerQuestionAsTwiddloo, ensureTwiddloo } from '@/lib/twiddloo';
import { getDailyQuestionStatus } from '@/lib/daily-question';
import { canDeleteQuestion } from '@/lib/question-deletion';
import { createQuestionWithSecret } from '@/lib/question-secrets-server';
import { dailyQuestionLimitResponse, isDailyQuestionLimitError } from '@/lib/daily-question-rule';
import { captureServerEvent } from '@/lib/analytics-server';

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

  const formData = await request.formData();
  const readField = (name: string): string => String(formData.get(name) ?? '').trim();
  const imageFile = formData.get('image');

  const text = readField('text');
  const questionType = readField('questionType') || 'multiple_choice';
  const choicesRaw = readField('choices');
  const correctAnswerIndexRaw = readField('correctAnswerIndex');
  const correctAnswer = readField('correctAnswer');
  const isPublicRaw = readField('isPublic');

  const isPublic = isPublicRaw === 'true';

  let choices: string[] = [];
  if (choicesRaw) {
    try {
      choices = JSON.parse(choicesRaw);
    } catch {
      return NextResponse.json({ error: 'Invalid choices format.' }, { status: 400 });
    }
  }

  const correctAnswerIndex = correctAnswerIndexRaw ? Number(correctAnswerIndexRaw) : -1;

  if (!text || text.length > MAX_QUESTION_TEXT) {
    return NextResponse.json({ error: `Question text is required (${MAX_QUESTION_TEXT} characters or fewer).` }, { status: 400 });
  }

  if (!['multiple_choice', 'free_text'].includes(questionType)) {
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
    if (!correctAnswer || correctAnswer.length > MAX_ANSWER_LENGTH) {
      return NextResponse.json({ error: `Free-text questions need a correct answer (${MAX_ANSWER_LENGTH} characters or fewer).` }, { status: 400 });
    }
  }

  // --- Optional image upload -------------------------------------------------
  const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
  let imageUrl: string | null = null;

  if (imageFile && imageFile instanceof File) {
    if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
      return NextResponse.json({ error: 'Image must be a JPG or PNG.' }, { status: 400 });
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be 1 MB or smaller.' }, { status: 400 });
    }

    const ext = imageFile.type === 'image/jpeg' ? 'jpg' : 'png';
    const fileName = `${user.id}/${Date.now()}.${ext}`;
    const arrayBuffer = await imageFile.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from('question-images')
      .upload(fileName, arrayBuffer, {
        contentType: imageFile.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('question-images')
      .getPublicUrl(fileName);

    imageUrl = publicUrlData.publicUrl;
  }

  const { hasAsked, error: dailyQuestionError } = await getDailyQuestionStatus(user.id);

  if (dailyQuestionError) {
    return NextResponse.json({ error: dailyQuestionError }, { status: 500 });
  }

  if (hasAsked) {
    // alreadyAsked lets the composer move the author to the feed instead of leaving them on a form
    // whose submit can only ever be refused.
    return NextResponse.json(dailyQuestionLimitResponse(), { status: 403 });
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

  const questionRow = insertedQuestion ?? null;
  if (questionRow && imageUrl) {
    const { error: imageUrlError } = await supabaseAdmin
      .from('questions')
      .update({ image_url: imageUrl })
      .eq('id', questionRow.id);

    if (imageUrlError) {
      await supabaseAdmin.storage.from('question-images').remove([`${user.id}/${Date.now()}.jpg`]);
      await supabaseAdmin.storage.from('question-images').remove([`${user.id}/${Date.now()}.png`]);
      return NextResponse.json({ error: imageUrlError.message }, { status: 500 });
    }
  }

  if (isDailyQuestionLimitError(insertError)) {
    return NextResponse.json(dailyQuestionLimitResponse(), { status: 403 });
  }
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // The RPC returns the public row; merge in the image URL if we uploaded one.
  const questionWithImage = questionRow
    ? { ...questionRow, image_url: imageUrl ?? null }
    : null;

  // Reached only once the question and its key are durably written by the same
  // transaction. A validation failure, a refused daily limit and a failed write
  // all return above, so none of them can emit a success event. The distinct ID
  // comes from the verified server session, never from the request body.
  //
  // Note this route is the human posting path only: twiddloo's own daily question
  // is created by the cron route through `seedTodaysTwiddlooQuestion`, so bot
  // activity never produces a `question_asked` here.
  if (questionWithImage) {
    await captureServerEvent({
      distinctId: user!.id,
      event: 'question_asked',
      properties: {
        question_id: questionWithImage.id,
        question_type: questionWithImage.question_type,
        has_image: Boolean(questionWithImage.image_url),
      },
      persistedId: questionWithImage.id,
    });
  }

  // twiddloo's answer is a flourish, not part of the author's post. The question is already saved and
  // has already used up today's allowance, so a twiddloo hiccup is logged rather than reported as a
  // failed post: telling the author it failed makes them retry, and the retry is refused because they
  // have in fact already asked today.
  try {
    await ensureTwiddloo();
    if (questionWithImage) await answerQuestionAsTwiddloo(questionWithImage);
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
    .select('id, author_id, created_at, image_url')
    .eq('id', questionId)
    .single();
  const question = questionData as { id: string; author_id: string; created_at: string; image_url: string | null } | null;

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

  // Remove the uploaded image from storage if one exists. File names are
  // `${user.id}/${timestamp}.${ext}`, so we try both extensions.
  if (question.image_url) {
    try {
      const url = new URL(question.image_url);
      const fileName = url.pathname.split('/').pop();
      if (fileName) {
        await supabaseAdmin.storage.from('question-images').remove([fileName]);
      }
    } catch {
      // Best-effort: don't block question deletion if image cleanup fails.
    }
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
