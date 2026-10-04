import { cache } from 'react';
import { supabaseAdmin } from './supabase-admin';

export const DAILY_QUESTION_WINDOW_MS = 24 * 60 * 60 * 1000;

type DailyQuestionStatus = {
  hasAsked: boolean;
  error: string | null;
};

/**
 * Single source of truth for the "one question per 24 hours" rule.
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

  const elapsed = Date.now() - new Date(latest.created_at).getTime();
  return { hasAsked: elapsed < DAILY_QUESTION_WINDOW_MS, error: null };
});