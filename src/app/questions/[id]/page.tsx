import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatRelativeDate } from '@/lib/utils';
import QuestionAnswerForm from '@/components/QuestionAnswerForm';
import DeleteQuestionButton from '@/components/DeleteQuestionButton';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedServerUser } from '@/lib/auth-server';
import { requireAskedToday } from '@/lib/daily-question-gate';
import { EMPTY_REPORT_SUMMARY, REPORT_REASON_LABELS, describeReportCount } from '@/lib/question-reports';
import { loadQuestionReportSummary } from '@/lib/question-reports-server';
import { PLAYABLE_QUESTION_COLUMNS, toPlayableQuestion, type PlayableQuestion } from '@/lib/playable-question';
import { loadQuestionSecret } from '@/lib/question-secrets-server';
import { correctAnswerText as describeSecret } from '@/lib/answer-grading';
import { withholdsQuestionsFrom } from '@/lib/user-blocks-server';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function QuestionPage({ params }: Props) {
  // Off limits until today's question has been asked. Signed-out visitors fall through unchanged.
  await requireAskedToday();

  const { id } = await params;
  const viewer = await getAuthenticatedServerUser();
  const currentUserId = viewer?.id;

  const { data: questionData, error: questionError } = await supabaseAdmin
    .from('questions')
    .select(PLAYABLE_QUESTION_COLUMNS)
    .eq('id', id)
    .single();
  const question = questionData as PlayableQuestion | null;

  if (questionError || !question) {
    notFound();
  }

  // A viewer this author has blocked gets the same 404 as a question that does
  // not exist, so a direct URL never confirms the block or leaks the content.
  if (await withholdsQuestionsFrom(question.author_id, currentUserId)) {
    notFound();
  }

  const [{ data: authorData }, { data: answerRowsData }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', question.author_id)
      .single(),
    currentUserId === question.author_id ? supabaseAdmin
      .from('answers')
      .select('id, responder_id, selected_choice_index, answer_text, is_correct, created_at')
      .eq('question_id', question.id)
      .order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
  ]);
  const author = authorData as { id: string; username: string; display_name: string | null } | null;
  const answerRows = answerRowsData as {
    id: string;
    responder_id: string;
    selected_choice_index: number | null;
    answer_text: string | null;
    is_correct: boolean;
    created_at: string;
  }[] | null;

  const responderIds = Array.from(new Set(answerRows?.map((answer) => answer.responder_id) ?? []));
  const { data: respondersData } = responderIds.length > 0
    ? await supabaseAdmin.from('profiles').select('id, username, display_name').in('id', responderIds)
    : { data: [] as { id: string; username: string; display_name: string | null }[] };
  const responders = respondersData as { id: string; username: string; display_name: string | null }[] | null;
  const responderMap = new Map((responders ?? []).map((profile) => [profile.id, profile]));

  // Read the private key only for the author; pass only an explicit safe object to the form.
  let correctAnswerText = 'Not set';
  if (currentUserId === question.author_id) {
    const secret = await loadQuestionSecret(question.id);
    const text = describeSecret(question, secret);
    correctAnswerText = question.question_type === 'multiple_choice'
      ? `${String.fromCharCode(65 + (secret.correct_answer_index ?? 0))}. ${text}` : text;
  }

  // Quality reports are private to the author, so they are only read when the author is looking.
  const reportSummary = currentUserId === question.author_id
    ? await loadQuestionReportSummary(question.id)
    : EMPTY_REPORT_SUMMARY;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pt-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#151519] p-6 shadow-2xl shadow-violet-950/10 md:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-200">{(author?.username ?? '?').charAt(0).toUpperCase()}</span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Asked by</p>
              <Link href={`/profile/${author?.username ?? ''}`} className="text-sm font-semibold text-violet-300 hover:text-violet-200">
                @{author?.username ?? 'unknown'}
            </Link>
            </div>
          </div>
          <span className="text-xs text-zinc-500">{formatRelativeDate(question.created_at)}</span>
        </div>
        {question.image_url ? (
          <div className="mt-8 flex justify-center">
            <img src={question.image_url} alt="Question image" className="max-h-64 max-w-full rounded-xl border border-white/[0.12] object-cover" />
          </div>
        ) : null}
        <p className="relative mt-10 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-zinc-50 md:text-5xl">{question.text}</p>
      </section>

      {currentUserId === question.author_id && (
      <section className="card p-5 md:p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-zinc-100">Answer summary</h2><span className="text-xs uppercase tracking-[0.1em] text-zinc-500">Your question</span></div>
        <p className="mt-3 text-sm text-zinc-400">
          Your correct answer: <span className="font-semibold text-zinc-100">{correctAnswerText}</span>
        </p>
        {question.question_type === 'free_text' ? (
          <p className="mt-1 text-xs text-zinc-500">Any aliases you accepted are separated by commas.</p>
        ) : null}
        {!answerRows || answerRows.length === 0 ? (
          <p className="mt-4 text-slate-700">No one has answered this question yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {answerRows.map((answer) => {
              const responder = responderMap.get(answer.responder_id);
              const pickedText = answer.answer_text ?? (answer.selected_choice_index === null ? 'No answer recorded' : question.choices[answer.selected_choice_index] ?? 'Unknown option');
              return (
                <div key={answer.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-zinc-200">{responder?.display_name ?? 'Unknown user'}</p>
                      <p className="text-xs text-zinc-500">@{responder?.username ?? 'unknown'}</p>
                    </div>
                    <span className={`badge ${answer.is_correct ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                      {answer.is_correct ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-400">
                    {question.question_type === 'free_text' ? 'Answered' : 'Chose'}: <span className="font-medium">{pickedText}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {/* The author can take their own question down, but not while it is still today's. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
          <p className="text-xs text-zinc-500">Deleting removes this question along with every answer and report attached to it.</p>
          <DeleteQuestionButton questionId={question.id} redirectTo={`/profile/${author?.username ?? ''}`} />
        </div>
      </section>
      )}

      {/* Private to the author, and rendered only when someone has actually flagged something. */}
      {currentUserId === question.author_id && reportSummary.total > 0 ? (
        <section className="card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-100">Question quality</h2>
            <span className="text-xs uppercase tracking-[0.1em] text-zinc-500">Only you can see this</span>
          </div>
          <p className="mt-3 text-sm font-semibold text-amber-200">{describeReportCount(reportSummary.total)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Only someone who answered incorrectly can flag a question, and it is a hunch rather than a verdict,
            so treat it as a nudge to double-check your answer.
          </p>
          {reportSummary.named.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {reportSummary.named.map((reporter) => (
                <li key={reporter.reporterId} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-zinc-200">{reporter.displayName ?? reporter.username}</p>
                    <p className="text-xs text-zinc-500">@{reporter.username}</p>
                  </div>
                  <span className="badge bg-amber-500/10 text-amber-200">{REPORT_REASON_LABELS[reporter.reason]}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {reportSummary.anonymousCount > 0 ? (
            <p className="mt-3 text-xs text-zinc-500">
              {reportSummary.anonymousCount === 1
                ? '1 report was sent anonymously.'
                : `${reportSummary.anonymousCount} reports were sent anonymously.`}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="card p-5 md:p-6">
        <p className="eyebrow">Your answer</p>
        <h2 className="mt-2 text-xl font-bold text-zinc-100">Submit your answer</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {question.question_type === 'free_text' ? 'Type your answer below and submit to see whether it is correct.' : 'Choose one answer below and submit to see whether it is correct.'}
        </p>
        <div className="mt-6">
          <QuestionAnswerForm question={toPlayableQuestion(question)} authorId={question.author_id} authorUsername={author?.username} />
        </div>
      </section>
    </div>
  );
}
