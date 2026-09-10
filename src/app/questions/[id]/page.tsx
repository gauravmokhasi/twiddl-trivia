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
    .select('id, responder_id, selected_choice_index, is_correct, created_at')
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
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Asked by</p>
            <Link href={`/profile/${author?.username ?? ''}`} className="text-sky-600 font-semibold">
              {author?.username ?? 'Unknown'}
            </Link>
          </div>
          <span className="text-sm text-slate-500">{formatRelativeDate(question.created_at)}</span>
        </div>
        <p className="mt-6 text-2xl font-semibold">{question.text}</p>
      </section>

      {currentUserId === question.author_id && (
      <section className="card">
        <h2 className="text-xl font-semibold">Answer summary</h2>
        {!answerRows || answerRows.length === 0 ? (
          <p className="mt-4 text-slate-700">No one has answered this question yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {answerRows.map((answer) => {
              const responder = responderMap.get(answer.responder_id);
              const pickedText = answer.answer_text ?? (answer.selected_choice_index === null ? 'No answer recorded' : question.choices[answer.selected_choice_index] ?? 'Unknown option');
              return (
                <div key={answer.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{responder?.display_name ?? 'Unknown user'}</p>
                      <p className="text-sm text-slate-600">@{responder?.username ?? 'unknown'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${answer.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {answer.is_correct ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    Chose: <span className="font-medium">{pickedText}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      <section className="card">
        <h2 className="text-xl font-semibold">Submit your answer</h2>
        <p className="mt-3 text-slate-600">
          {question.question_type === 'free_text' ? 'Type your answer below and submit to see whether it is correct.' : 'Choose one answer below and submit to see whether it is correct.'}
        </p>
        <div className="mt-6">
          <QuestionAnswerForm question={question} authorId={question.author_id} />
        </div>
      </section>
    </div>
  );
}
