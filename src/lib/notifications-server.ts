import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  groupAnswersByQuestionAndDay,
  groupFollowsByDay,
  groupReportsByQuestionAndDay,
  mergeDigestDays,
  type AnswerRow,
  type DigestDay,
  type FollowRow,
  type ReportRow,
} from '@/lib/notifications';

/** How far back the digest looks. Keeps the page bounded without pagination. */
const DIGEST_LOOKBACK_DAYS = 30;

/**
 * Builds the viewer's daily digest from existing activity rows. Three bounded
 * queries (own questions -> answers on them, reports on them, follows of the
 * viewer), then pure in-memory grouping. No notification rows are stored.
 */
export async function loadNotificationDigest(userId: string, now = new Date()): Promise<DigestDay[]> {
  const sinceIso = new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: ownQuestionsData } = await supabaseAdmin
    .from('questions')
    .select('id, text')
    .eq('author_id', userId);
  const ownQuestions = (ownQuestionsData ?? []) as { id: string; text: string }[];
  const ownQuestionIds = ownQuestions.map((question) => question.id);
  const questionTextById = new Map(ownQuestions.map((question) => [question.id, question.text]));

  const [answersResult, reportsResult, followsResult] = await Promise.all([
    ownQuestionIds.length > 0
      ? supabaseAdmin
        .from('answers')
        .select('question_id, responder_id, created_at')
        .in('question_id', ownQuestionIds)
        .neq('responder_id', userId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500)
      : Promise.resolve({ data: [] as never[] }),
    ownQuestionIds.length > 0
      ? supabaseAdmin
        .from('question_reports')
        .select('question_id, created_at')
        .in('question_id', ownQuestionIds)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(200)
      : Promise.resolve({ data: [] as never[] }),
    supabaseAdmin
      .from('follows')
      .select('follower_id, created_at')
      .eq('followee_id', userId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const answerRows = (answersResult.data ?? []) as { question_id: string; responder_id: string; created_at: string }[];
  const reportRows = (reportsResult.data ?? []) as { question_id: string; created_at: string }[];
  const followRows = (followsResult.data ?? []) as { follower_id: string; created_at: string }[];

  // One profile lookup for every distinct other user in the digest, so the
  // page never N+1s per notification.
  const otherUserIds = Array.from(new Set([
    ...answerRows.map((row) => row.responder_id),
    ...followRows.map((row) => row.follower_id),
  ]));

  const usernameById = new Map<string, string>();
  if (otherUserIds.length > 0) {
    const { data: profilesData } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .in('id', otherUserIds);
    for (const profile of ((profilesData ?? []) as { id: string; username: string }[])) {
      usernameById.set(profile.id, profile.username);
    }
  }

  const answerInput: AnswerRow[] = answerRows.map((row) => ({
    question_id: row.question_id,
    question_text: questionTextById.get(row.question_id) ?? 'Your question',
    responder_username: usernameById.get(row.responder_id) ?? null,
    created_at: row.created_at,
  }));

  const reportInput: ReportRow[] = reportRows.map((row) => ({
    question_id: row.question_id,
    question_text: questionTextById.get(row.question_id) ?? 'Your question',
    created_at: row.created_at,
  }));

  const followInput: FollowRow[] = followRows.map((row) => ({
    follower_username: usernameById.get(row.follower_id) ?? null,
    created_at: row.created_at,
  }));

  return mergeDigestDays([
    groupAnswersByQuestionAndDay(answerInput, now),
    groupReportsByQuestionAndDay(reportInput, now),
    groupFollowsByDay(followInput, now),
  ], now);
}

/** Newest activity across the digest, for the "new since last visit" dot. */
export function digestLatestAt(days: DigestDay[]): string | null {
  let latest: string | null = null;
  for (const day of days) {
    for (const item of day.items) {
      if (!latest || item.latestAt > latest) latest = item.latestAt;
    }
  }
  return latest;
}
