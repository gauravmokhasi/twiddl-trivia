/**
 * Question quality reports: a quiet failsafe that lets someone who answered a question incorrectly
 * tell the author the question or its answer looked wrong or ambiguous.
 *
 * Everything here is pure so the summary rules can be checked without a database. The read lives in
 * question-reports-server.ts and the write lives in the API route.
 */

export const REPORT_REASONS = ['answer_wrong', 'ambiguous'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Neutral button copy, so flagging a question never reads as an accusation. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  answer_wrong: 'The answer looks wrong',
  ambiguous: 'The question is ambiguous',
};

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value);
}

export type ReportRow = {
  reporter_id: string;
  reason: ReportReason;
  is_anonymous: boolean;
};

export type NamedReporter = {
  reporterId: string;
  username: string;
  displayName: string | null;
  reason: ReportReason;
};

export type QuestionReportSummary = {
  total: number;
  anonymousCount: number;
  named: NamedReporter[];
};

export const EMPTY_REPORT_SUMMARY: QuestionReportSummary = { total: 0, anonymousCount: 0, named: [] };

/**
 * Counts the reports on a question and splits them into named and anonymous.
 *
 * An anonymous report still counts towards the total, it simply never carries a name. A report that
 * claims to be named but whose profile cannot be resolved is counted as anonymous rather than
 * displayed as an unknown person.
 */
export function summarizeQuestionReports(
  rows: ReportRow[],
  profiles: { id: string; username: string; display_name: string | null }[],
): QuestionReportSummary {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const named: NamedReporter[] = [];
  let anonymousCount = 0;

  for (const row of rows) {
    const profile = row.is_anonymous ? undefined : profilesById.get(row.reporter_id);

    if (!profile) {
      anonymousCount += 1;
      continue;
    }

    named.push({
      reporterId: row.reporter_id,
      username: profile.username,
      displayName: profile.display_name,
      reason: row.reason,
    });
  }

  return { total: rows.length, anonymousCount, named };
}

/** Author-facing headline. Empty at zero, because nothing should be shown at all in that case. */
export function describeReportCount(total: number) {
  if (total <= 0) return '';

  return total === 1
    ? '1 person thinks something is off with this question'
    : `${total} people think something is off with this question`;
}