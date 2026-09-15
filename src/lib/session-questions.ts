import { supabaseAdmin } from './supabase-admin';
import type { Question } from './database.types';

export type SessionQuestion = Question & { author_username: string };

export const SESSION_QUESTION_COLUMNS = 'id, author_id, text, choices, correct_answer_index, question_type, correct_answer, is_public, created_at';

type Options = {
  userId: string;
  /** Restrict to questions from these authors. Omit for a platform-wide queue. */
  authorIds?: string[];
  /** Only include questions created at or after this ISO timestamp. */
  sinceIso?: string;
  /** Only include public questions (used by the platform-wide Explore queue). */
  publicOnly?: boolean;
};

/**
 * The questions a user can still answer: not their own, not already answered, newest first,
 * with the author's username attached for the answering UI.
 */
export async function unansweredSessionQuestions(options: Options): Promise<SessionQuestion[]> {
  const { userId, authorIds, sinceIso, publicOnly } = options;

  if (authorIds && authorIds.length === 0) return [];

  let questionsQuery: any = (supabaseAdmin.from('questions') as any)
    .select(SESSION_QUESTION_COLUMNS)
    .neq('author_id', userId)
    .order('created_at', { ascending: false });

  if (authorIds) questionsQuery = questionsQuery.in('author_id', authorIds);
  if (sinceIso) questionsQuery = questionsQuery.gte('created_at', sinceIso);
  if (publicOnly) questionsQuery = questionsQuery.eq('is_public', true);

  const { data: questionsData } = await questionsQuery;
  const questions = (questionsData ?? []) as Question[];
  if (questions.length === 0) return [];

  const questionIds = questions.map((question) => question.id);
  const { data: answeredData } = await (supabaseAdmin.from('answers') as any)
    .select('question_id')
    .eq('responder_id', userId)
    .in('question_id', questionIds);
  const answeredIds = new Set(((answeredData ?? []) as { question_id: string }[]).map((answer) => answer.question_id));

  const unanswered = questions.filter((question) => !answeredIds.has(question.id));
  if (unanswered.length === 0) return [];

  const authorIdsForProfiles = Array.from(new Set(unanswered.map((question) => question.author_id)));
  const { data: authorsData } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .in('id', authorIdsForProfiles);
  const authorMap = new Map(
    ((authorsData ?? []) as { id: string; username: string }[]).map((author) => [author.id, author.username]),
  );

  return unanswered.map((question) => ({
    ...question,
    author_username: authorMap.get(question.author_id) ?? 'unknown',
  }));
}

/** How many of these questions the user has not answered yet. */
export async function countUnansweredQuestions(userId: string, questionIds: string[]) {
  if (questionIds.length === 0) return 0;

  const { data } = await (supabaseAdmin.from('answers') as any)
    .select('question_id')
    .eq('responder_id', userId)
    .in('question_id', questionIds);
  const answered = new Set(((data ?? []) as { question_id: string }[]).map((answer) => answer.question_id));

  return questionIds.filter((id) => !answered.has(id)).length;
}