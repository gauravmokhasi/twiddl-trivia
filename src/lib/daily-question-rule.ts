/** Postgres emits this application-specific SQLSTATE from the atomic question writer. */
export const DAILY_QUESTION_LIMIT_CODE = 'TWD01';
export const DAILY_QUESTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isDailyQuestionLimitError(error: { code?: string } | null | undefined): boolean {
  return error?.code === DAILY_QUESTION_LIMIT_CODE;
}

export function dailyQuestionLimitResponse() {
  return { error: 'You can only ask one question every 24 hours.', alreadyAsked: true };
}

export function hasAskedWithinWindow(createdAt: string, nowMs = Date.now()): boolean {
  return new Date(createdAt).getTime() > nowMs - DAILY_QUESTION_WINDOW_MS;
}
