import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  groupAnswersByQuestionAndDay,
  groupFollowsByDay,
  groupReportsByQuestionAndDay,
  mergeDigestDays,
  type AnswerRow,
  type DigestDay,
  type FollowRow,
  type MarkedCorrectDigestItem,
  type ReportRow,
  dayLabel,
  utcDayKey,
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

  // Answers on the viewer's own questions that the author manually marked correct.
  const { data: markedCorrectData } = await supabaseAdmin
    .from('answers')
    .select('id, question_id, answer_text, marked_correct_at, marked_correct_by, questions!inner(text)')
    .eq('responder_id', userId)
    .not('marked_correct_by', 'is', null)
    .neq('marked_correct_by', userId)
    .gte('marked_correct_at', sinceIso)
    .order('marked_correct_at', { ascending: false })
    .limit(200);

  const markedCorrectRows = (markedCorrectData ?? []) as unknown as {
    id: string;
    question_id: string;
    answer_text: string | null;
    marked_correct_at: string | null;
    marked_correct_by: string | null;
    questions: { text: string } | null;
  }[];

  // Look up the usernames of who did the marking.
  const markerIds = Array.from(
    new Set(markedCorrectRows.map((row) => row.marked_correct_by).filter((id): id is string => id !== null)),
  );
  const markerUsernameById = new Map<string, string>();
  if (markerIds.length > 0) {
    const { data: markersData } = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .in('id', markerIds);
    for (const profile of ((markersData ?? []) as { id: string; username: string }[])) {
      markerUsernameById.set(profile.id, profile.username);
    }
  }

  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  // Group marked-correct items by UTC day.
  const markedCorrectByDay = new Map<string, MarkedCorrectDigestItem[]>();
  for (const row of markedCorrectRows) {
    if (!row.marked_correct_at) continue;
    const day = utcDayKey(row.marked_correct_at);
    const existing = markedCorrectByDay.get(day) ?? [];
    existing.push({
      kind: 'marked_correct',
      questionId: row.question_id,
      questionText: row.questions?.text ?? 'Your question',
      answerText: row.answer_text ?? '',
      markedByUsername: row.marked_correct_by ? markerUsernameById.get(row.marked_correct_by) ?? null : null,
      markedAt: row.marked_correct_at,
      latestAt: row.marked_correct_at,
    });
    markedCorrectByDay.set(day, existing);
  }
  const markedCorrectDays: DigestDay[] = [...markedCorrectByDay.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([day, items]) => ({
      day,
      label: dayLabel(day, todayKey, yesterdayKey),
      items: items.sort((left, right) => (left.markedAt < right.markedAt ? 1 : -1)),
    }));

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
    markedCorrectDays,
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
