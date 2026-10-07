import type { Question } from './database.types';

/** The complete allowlist for question data that may cross into the answering browser. */
export type PlayableQuestion = Pick<Question,
  'id' | 'author_id' | 'text' | 'choices' | 'question_type' | 'is_public' | 'created_at'
>;

export const PLAYABLE_QUESTION_COLUMNS = 'id, author_id, text, choices, question_type, is_public, created_at';

/** Pick at runtime too: a wider object must never leak extra fields through a spread. */
export function toPlayableQuestion(question: PlayableQuestion): PlayableQuestion {
  return {
    id: question.id,
    author_id: question.author_id,
    text: question.text,
    choices: question.choices,
    question_type: question.question_type,
    is_public: question.is_public,
    created_at: question.created_at,
  };
}
