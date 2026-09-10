import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAnswerCorrect } from '@/lib/answer-checker';

export const TWIDDL_BOT_ID = '00000000-0000-4000-8000-000000000001';

export async function ensureTwiddlBot() {
  const { error } = await (supabaseAdmin.from('profiles') as any).upsert({
    id: TWIDDL_BOT_ID,
    email: 'twiddlbot@twiddl.local',
    username: 'twiddlBot',
    display_name: 'twiddlBot',
    bio: 'An automated trivia companion.',
    is_public: true,
  }, { onConflict: 'id' });

  if (error) throw new Error(error.message);
}

export async function ensureDefaultRelationshipsForUser(userId: string) {
  await ensureTwiddlBot();

  if (userId === TWIDDL_BOT_ID) return;

  const { error: botFollowsUserError } = await (supabaseAdmin.from('follows') as any).upsert({
    follower_id: TWIDDL_BOT_ID,
    followee_id: userId,
  }, { onConflict: ['follower_id', 'followee_id'] });

  if (botFollowsUserError) throw new Error(botFollowsUserError.message);

  const { data: existingFollow, error: existingFollowError } = await supabaseAdmin
    .from('follows')
    .select('follower_id')
    .eq('follower_id', userId)
    .eq('followee_id', TWIDDL_BOT_ID)
    .maybeSingle();

  if (existingFollowError) throw new Error(existingFollowError.message);

  const { data: optOut, error: optOutError } = await (supabaseAdmin.from('bot_follow_opt_outs') as any)
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (optOutError) throw new Error(optOutError.message);
  if (optOut) return;

  if (!existingFollow) {
    const { error: userFollowsBotError } = await (supabaseAdmin.from('follows') as any).insert({
      follower_id: userId,
      followee_id: TWIDDL_BOT_ID,
    });

    if (userFollowsBotError) throw new Error(userFollowsBotError.message);
  }
}

function deterministicIndex(value: string, length: number) {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0) % length;
}

export async function answerQuestionAsBot(question: {
  id: string;
  text: string;
  question_type: 'multiple_choice' | 'free_text';
  choices: string[];
}) {
  if (question.question_type === 'multiple_choice' && question.choices.length === 0) return;

  const selectedChoiceIndex = question.question_type === 'multiple_choice'
    ? deterministicIndex(question.text, question.choices.length)
    : null;
  const answerText = question.question_type === 'free_text'
    ? question.text.split(/\s+/).slice(-1)[0]?.replace(/[^a-z0-9]/gi, '') || 'I am not sure'
    : null;

  const { data: gradingData } = await supabaseAdmin
    .from('questions')
    .select('correct_answer_index, correct_answer')
    .eq('id', question.id)
    .single();
  const grading = gradingData as { correct_answer_index: number; correct_answer: string | null } | null;
  const isCorrect = question.question_type === 'free_text'
    ? isAnswerCorrect(answerText ?? '', grading?.correct_answer ?? '')
    : selectedChoiceIndex === grading?.correct_answer_index;

  const { error } = await (supabaseAdmin.from('answers') as any).upsert({
    question_id: question.id,
    responder_id: TWIDDL_BOT_ID,
    selected_choice_index: selectedChoiceIndex,
    answer_text: answerText,
    is_correct: isCorrect,
  }, { onConflict: ['question_id', 'responder_id'] });

  if (error) throw new Error(error.message);
}

export async function seedTodaysBotQuestion() {
  await ensureTwiddlBot();

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const { data: existingQuestionData, error: existingQuestionError } = await supabaseAdmin
    .from('questions')
    .select('id')
    .eq('author_id', TWIDDL_BOT_ID)
    .gte('created_at', startOfToday.toISOString())
    .maybeSingle();
  const existingQuestion = existingQuestionData as { id: string } | null;

  if (existingQuestionError) throw new Error(existingQuestionError.message);
  if (existingQuestion) return existingQuestion.id;

  const questions = [
    { text: 'Which planet is known as the Red Planet?', choices: ['Mars', 'Venus', 'Jupiter'], correctAnswerIndex: 0 },
    { text: 'What is the largest ocean on Earth?', choices: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean'], correctAnswerIndex: 1 },
    { text: 'How many sides does a hexagon have?', choices: ['Five', 'Six', 'Eight'], correctAnswerIndex: 1 },
  ];
  const question = questions[new Date().getUTCDate() % questions.length];

  const { data: insertedQuestion, error: insertError } = await (supabaseAdmin.from('questions') as any).insert({
    author_id: TWIDDL_BOT_ID,
    text: question.text,
    choices: question.choices,
    correct_answer_index: question.correctAnswerIndex,
    question_type: 'multiple_choice',
    correct_answer: null,
    is_public: true,
  }).select('id').single();

  if (insertError || !insertedQuestion) throw new Error(insertError?.message ?? 'Unable to create twiddlBot question.');
  return insertedQuestion.id;
}
