import { supabaseAdmin } from '@/lib/supabase-admin';
import { isAnswerCorrect } from '@/lib/answer-checker';
import { guessAnswerFromWeb, pickChoiceFromGuess } from '@/lib/answer-guesser';

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

  // Best effort: look the answer up on the web first, then fall back to a simple guess.
  const webGuess = await guessAnswerFromWeb(question.text);
  const fallbackText = question.text.split(/\s+/).slice(-1)[0]?.replace(/[^a-z0-9]/gi, '') || 'I am not sure';

  const selectedChoiceIndex = question.question_type === 'multiple_choice'
    ? pickChoiceFromGuess(question.choices, webGuess) ?? deterministicIndex(question.text, question.choices.length)
    : null;
  const answerText = question.question_type === 'free_text'
    ? webGuess?.answer ?? fallbackText
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

  // The bot's question pool, written to follow the "How to Write a Great Twiddl Question" guide:
  // clue-led rather than fact-recall. Every fact here has been checked against the subject's own
  // reference article. Clue-style questions are free text (answered via the fuzzy grader with the
  // aliases after the commas); a few stay multiple choice for variety.
  type PoolQuestion = {
    text: string;
    questionType: 'multiple_choice' | 'free_text';
    choices: string[];
    correctAnswerIndex: number;
    correctAnswer: string | null;
  };

  const questionPool: PoolQuestion[] = [
    {
      text: 'This composer wrote The Four Seasons, and he earned the nickname the Red Priest because of his hair colour. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Antonio Vivaldi, Vivaldi, il Prete Rosso',
    },
    {
      text: 'This painter sold very few paintings in his lifetime and cut off part of his own ear. He painted The Starry Night while staying at an asylum. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Vincent van Gogh, Van Gogh, Vincent',
    },
    {
      text: 'This physicist became a byword for genius. He won the Nobel Prize for explaining the photoelectric effect rather than for the theory he is best known for, and his most famous equation links energy with mass. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Albert Einstein, Einstein',
    },
    {
      text: 'This composer wrote his first symphony at eight and was touring Europe as a child prodigy before he was ten. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Wolfgang Amadeus Mozart, Mozart',
    },
    {
      text: 'Her research on radioactivity won her Nobel Prizes in two different sciences, and she is still the only person to win a Nobel in both physics and chemistry. Who is she?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Marie Curie, Curie, Maria Sklodowska',
    },
    {
      text: 'This composer was already deaf when his Ninth Symphony premiered, and that symphony ends with a setting of Schiller\'s Ode to Joy. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Ludwig van Beethoven, Beethoven',
    },
    {
      text: 'This metal has been used in thermometers for centuries, has the chemical symbol Hg, and is the only metal that is a liquid at room temperature. What is it?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Mercury, quicksilver',
    },
    {
      text: 'This planet is so light that it would float in water, and one of its moons has lakes of liquid methane. Which planet is it?',
      questionType: 'multiple_choice',
      choices: ['Jupiter', 'Saturn', 'Neptune'],
      correctAnswerIndex: 1,
      correctAnswer: null,
    },
    {
      text: 'He is said to have shouted Eureka when he noticed the water rise in his bath, and a principle about buoyancy carries his name. Who was he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Archimedes',
    },
    {
      text: 'This bird is the fastest animal on Earth, reaching over 300 km/h in a dive. Which bird is it?',
      questionType: 'multiple_choice',
      choices: ['Golden eagle', 'Peregrine falcon', 'Barn owl'],
      correctAnswerIndex: 1,
      correctAnswer: null,
    },
    {
      text: 'One joule per second is the definition of this unit of power, which is named after a Scottish engineer. Which unit is it?',
      questionType: 'multiple_choice',
      choices: ['Watt', 'Volt', 'Ampere'],
      correctAnswerIndex: 0,
      correctAnswer: null,
    },
    {
      text: 'This naturalist spent five years aboard a survey ship and then waited more than twenty years to publish On the Origin of Species. Who is he?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Charles Darwin, Darwin',
    },
    {
      text: 'A thought experiment involving this physicist\'s cat leaves it both alive and dead. Who is the physicist?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Erwin Schrodinger, Erwin Schrödinger, Schrodinger, Schrödinger',
    },
    {
      text: 'This is the only mammal capable of true sustained flight rather than just gliding. What is it?',
      questionType: 'free_text',
      choices: [],
      correctAnswerIndex: -1,
      correctAnswer: 'Bat, Bats, a bat, the bat',
    },
    {
      text: 'Which planet is known as the Red Planet?',
      questionType: 'multiple_choice',
      choices: ['Mars', 'Venus', 'Jupiter'],
      correctAnswerIndex: 0,
      correctAnswer: null,
    },
    {
      text: 'What is the largest ocean on Earth?',
      questionType: 'multiple_choice',
      choices: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean'],
      correctAnswerIndex: 1,
      correctAnswer: null,
    },
    {
      text: 'How many sides does a hexagon have?',
      questionType: 'multiple_choice',
      choices: ['Five', 'Six', 'Eight'],
      correctAnswerIndex: 1,
      correctAnswer: null,
    },
  ];

  const { data: askedQuestionsData, error: askedQuestionsError } = await supabaseAdmin
    .from('questions')
    .select('text, created_at')
    .eq('author_id', TWIDDL_BOT_ID);
  const askedQuestions = (askedQuestionsData as { text: string; created_at: string }[] | null) ?? [];

  if (askedQuestionsError) throw new Error(askedQuestionsError.message);

  const askedTexts = new Set(askedQuestions.map((item) => item.text.trim().toLowerCase()));
  const earliestAsk = (text: string) => askedQuestions
    .filter((item) => item.text.trim().toLowerCase() === text.trim().toLowerCase())
    .reduce((earliest, item) => Math.min(earliest, new Date(item.created_at).getTime()), Number.POSITIVE_INFINITY);
  const neverAsked = questionPool.filter((item) => !askedTexts.has(item.text.trim().toLowerCase()));

  // Never ask the same question twice. If the pool is ever exhausted, fall back to whichever
  // question was asked longest ago so the daily feed keeps flowing.
  const question = neverAsked.length > 0
    ? neverAsked[0]
    : questionPool.slice().sort((left, right) => earliestAsk(left.text) - earliestAsk(right.text))[0];

  const isMultipleChoice = question.questionType === 'multiple_choice';

  const { data: insertedQuestion, error: insertError } = await (supabaseAdmin.from('questions') as any).insert({
    author_id: TWIDDL_BOT_ID,
    text: question.text,
    choices: isMultipleChoice ? question.choices : [],
    correct_answer_index: isMultipleChoice ? question.correctAnswerIndex : -1,
    question_type: question.questionType,
    correct_answer: isMultipleChoice ? null : question.correctAnswer,
    is_public: true,
  }).select('id').single();

  if (insertError || !insertedQuestion) throw new Error(insertError?.message ?? 'Unable to create twiddlBot question.');
  return insertedQuestion.id;
}
