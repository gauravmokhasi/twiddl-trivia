/**
 * Shared server-side request guards for API routes.
 *
 * readJsonBody returns null (never throws) on malformed JSON, so a bad
 * payload becomes a 400 instead of an unhandled 500.
 */

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Shared server-side input limits. The composer mirrors these client-side. */
export const MAX_QUESTION_TEXT = 320;
export const MAX_CHOICES = 4;
export const MAX_CHOICE_LENGTH = 120;
export const MAX_ANSWER_LENGTH = 160;
export const MAX_ANSWER_TEXT = 200;
