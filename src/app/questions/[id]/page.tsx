import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatRelativeDate } from '@/lib/utils';
import QuestionAnswerForm from '@/components/QuestionAnswerForm';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Database } from '@/lib/database.types';

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function QuestionPage({ params }: Props) {
  const supabase = await createServerSupabase();
  const { id } = await params;
  const { data: { session } } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id;

  const { data: questionData, error: questionError } = await supabaseAdmin
    .from('questions')
    .select('id, author_id, text, choices, correct_answer_index, question_type, correct_answer, is_public, created_at')
    .eq('id', id)
    .single();
  const question = questionData as {
    id: string;
    author_id: string;
    text: string;
    choices: string[];
    correct_answer_index: number;
    question_type: 'multiple_choice' | 'free_text';
    correct_answer: string | null;
    is_public: boolean;
    created_at: string;
  } | null;

  if (questionError || !question) {
    notFound();
  }

  const { data: authorData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name')
    .eq('id', question.author_id)
    .single();
  const author = authorData as { id: string; username: string; display_name: string | null } | null;

  const { data: answerRowsData } = await supabaseAdmin
    .from('answers')
    .select('id, responder_id, selected_choice_index, answer_text, is_correct, created_at')
    .eq('question_id', question.id)
    .order('created_at', { ascending: true });
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
        <p className="relative mt-10 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-zinc-50 md:text-5xl">{question.text}</p>
      </section>

      {currentUserId === question.author_id && (
      <section className="card p-5 md:p-6">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-zinc-100">Answer summary</h2><span className="text-xs uppercase tracking-[0.1em] text-zinc-500">Your question</span></div>
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
      </section>
      )}

      <section className="card p-5 md:p-6">
        <p className="eyebrow">Your answer</p>
        <h2 className="mt-2 text-xl font-bold text-zinc-100">Submit your answer</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {question.question_type === 'free_text' ? 'Type your answer below and submit to see whether it is correct.' : 'Choose one answer below and submit to see whether it is correct.'}
        </p>
        <div className="mt-6">
          <QuestionAnswerForm question={question} authorId={question.author_id} />
        </div>
      </section>
    </div>
  );
}
