import Link from 'next/link';

import { GUIDANCE_INTRO, GUIDANCE_PRINCIPLES, GUIDANCE_PROMISE, GUIDANCE_EXAMPLE } from '@/lib/question-guidance';

export const metadata = {
  title: 'How to Write a Great Twiddl Question',
};

export default function HowToWriteAQuestionPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 pt-6">
      <header>
        <p className="eyebrow">Better questions</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-zinc-50">How to Write a Great Twiddl Question</h1>
        <p className="mt-5 text-lg leading-8 text-zinc-300">{GUIDANCE_INTRO}</p>
        <p className="mt-4 leading-7 text-zinc-400">{GUIDANCE_PROMISE}</p>
      </header>

      <section className="space-y-4">
        {GUIDANCE_PRINCIPLES.map((principle) => (
          <div key={principle.title} className="card p-5 md:p-6">
            <h2 className="text-lg font-bold tracking-tight text-zinc-100">{principle.title}</h2>
            <p className="mt-2 leading-7 text-zinc-400">{principle.body}</p>
          </div>
        ))}
      </section>

      <section className="card p-6 md:p-8">
        <p className="eyebrow">Here&apos;s an example</p>
        <p className="mt-3 text-sm italic leading-6 text-zinc-500">{GUIDANCE_EXAMPLE.note}</p>
        <p className="mt-5 text-lg leading-8 text-zinc-200">{GUIDANCE_EXAMPLE.text}</p>
        <p className="mt-6 text-2xl font-bold tracking-tight text-zinc-50">{GUIDANCE_EXAMPLE.prompt}</p>
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-300">Answer: {GUIDANCE_EXAMPLE.answer}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link className="button button-primary" href="/">Start asking <span className="ml-2 text-white/70">→</span></Link>
        <span className="text-xs text-zinc-500">One question a day. Make it a good one.</span>
      </div>
    </article>
  );
}