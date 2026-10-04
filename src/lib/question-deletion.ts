/**
 * The rule for deleting your own question.
 *
 * Deletion is author-only, and a question has to be a day old before it can go. That second part is
 * deliberate: the daily question gate counts the newest question a user asked, so allowing the day's
 * question to be deleted would turn "one question every 24 hours" into "ask, delete, ask again".
 *
 * The window is kept in sync by hand with DAILY_QUESTION_WINDOW_MS in daily-question.ts so this
 * module stays free of server-only imports and remains unit testable.
 */

export const QUESTION_DELETION_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type QuestionDeletionCheck =
  | { allowed: true }
  | { allowed: false; status: 400 | 401 | 403; error: string };

type Input = {
  viewerId: string | null | undefined;
  authorId: string;
  /** ISO timestamp of when the question was asked. */
  createdAt: string;
  /** Injectable for tests. */
  now?: number;
};

/**
 * Decides whether a question may be deleted right now, and explains the refusal when it may not.
 */
export function canDeleteQuestion({ viewerId, authorId, createdAt, now = Date.now() }: Input): QuestionDeletionCheck {
  if (!viewerId) {
    return { allowed: false, status: 401, error: 'Authentication required.' };
  }

  if (viewerId !== authorId) {
    return { allowed: false, status: 403, error: 'You can only delete questions you asked.' };
  }

  const askedAt = new Date(createdAt).getTime();

  if (Number.isNaN(askedAt)) {
    return { allowed: false, status: 400, error: 'That question has an unreadable date, so it was left alone.' };
  }

  if (now - askedAt < QUESTION_DELETION_MIN_AGE_MS) {
    return {
      allowed: false,
      status: 400,
      error: "This one is still today's question, so it cannot be deleted yet. Try again once it is a day old.",
    };
  }

  return { allowed: true };
}