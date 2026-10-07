import 'server-only';
import { supabaseAdmin } from './supabase-admin';
import type { Database, Question } from './database.types';

type QuestionSecret = Database['public']['Tables']['question_secrets']['Row'];

export async function loadQuestionSecret(questionId: string): Promise<QuestionSecret> {
  const { data, error } = await supabaseAdmin.from('question_secrets')
    .select('question_id, correct_answer_index, correct_answer').eq('question_id', questionId).single();
  if (error || !data) throw new Error('Unable to load the answer key.');
  return data as QuestionSecret;
}

/** The public row and its key succeed or fail together, including during the staged rollout. */
export async function createQuestionWithSecret(input: Database['public']['Functions']['create_question_with_secret']['Args']) {
  const { data, error } = await supabaseAdmin.rpc('create_question_with_secret', input);
  return { data: data as Question | null, error };
}
