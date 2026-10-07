import { cache } from 'react';
import { supabaseAdmin } from './supabase-admin';
import { hasAskedWithinWindow } from './daily-question-rule';
export { DAILY_QUESTION_WINDOW_MS } from './daily-question-rule';

type DailyQuestionStatus = {
  hasAsked: boolean;
  error: string | null;
};

/**
 * Read-only view of the rolling daily limit for routing and early API feedback.
 * Final enforcement lives in Postgres create_question_with_secret.
 * Used by the ask API route, the home page routing, and the app-wide route guard.
 *
 * Memoised per request so a layout and the page it wraps never query this twice in one render.
 */
export const getDailyQuestionStatus = cache(async (userId: string): Promise<DailyQuestionStatus> => {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return { hasAsked: false, error: error.message };
  }

  const latest = (data as { created_at: string }[] | null)?.[0];
  if (!latest) {
    return { hasAsked: false, error: null };
  }

  return { hasAsked: hasAskedWithinWindow(latest.created_at), error: null };
});