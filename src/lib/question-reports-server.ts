import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  EMPTY_REPORT_SUMMARY,
  summarizeQuestionReports,
  type QuestionReportSummary,
  type ReportReason,
} from '@/lib/question-reports';

/**
 * Reads the reports on one question for the author-only summary.
 *
 * Never throws. If the question_reports table has not been created yet (see SUPABASE_SETUP.md) the
 * profile page and the question page still render, just without the summary.
 */
export async function loadQuestionReportSummary(questionId: string): Promise<QuestionReportSummary> {
  try {
    const { data, error } = await supabaseAdmin
      .from('question_reports')
      .select('reporter_id, reason, is_anonymous')
      .eq('question_id', questionId);

    if (error) {
      console.warn(`[questionReports] lookup failed for ${questionId}: ${error.message}`);
      return EMPTY_REPORT_SUMMARY;
    }

    const rows = (data ?? []) as { reporter_id: string; reason: ReportReason; is_anonymous: boolean }[];
    if (rows.length === 0) return EMPTY_REPORT_SUMMARY;

    const reporterIds = Array.from(new Set(rows.map((row) => row.reporter_id)));
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name')
      .in('id', reporterIds);

    if (profilesError) {
      console.warn(`[questionReports] reporter lookup failed for ${questionId}: ${profilesError.message}`);
    }

    return summarizeQuestionReports(
      rows,
      (profilesData ?? []) as { id: string; username: string; display_name: string | null }[],
    );
  } catch (error) {
    console.warn(`[questionReports] lookup threw for ${questionId}: ${error instanceof Error ? error.message : 'unknown error'}`);
    return EMPTY_REPORT_SUMMARY;
  }
}