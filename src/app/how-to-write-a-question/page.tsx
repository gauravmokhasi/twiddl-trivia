import Link from 'next/link';

export const metadata = {
  title: 'How to Write a Great Twiddl Question',
};

const principles = [
  {
    title: 'Give people a way in.',
    body: "Don't just ask for a fact. Offer clues that help someone work towards the answer, even if they've never heard it before. A good question gives everyone a fighting chance, not just the person with the best memory.",
  },
  {
    title: 'Connect the unexpected.',
    body: 'Link a musician to a scientific discovery, a historical event to a modern brand, or two seemingly unrelated clues to a surprising third answer. The more satisfying the connection, the more memorable the question.',
  },
  {
    title: 'Make every clue count.',
    body: 'Each clue should bring someone closer to the answer. A clever twist might make them reconsider their first guess, but the solution should always feel fair and obvious in hindsight.',
  },
  {
    title: 'Mix things up.',
    body: 'Try wordplay, images, riddles, sequences, or questions that take a few mental steps to solve. A picture might provide one clue, a historical fact another. Surprise people with how you lead them to the answer.',
  },
  {
    title: 'Make solving more fun than knowing.',
    body: "A question that most people can work out can be far more enjoyable than one that only a handful of experts can answer. The goal isn't to stump everyone. It's to give them the satisfaction of getting there.",
  },
];

const exampleNote = "We've deliberately kept this one easy to show how a few connected clues can make even a familiar answer fun.";
const exampleQuestion = 'This scientist shares his surname with the SI unit of force. His work helped explain why planets orbit the Sun, and a famous story about a falling apple is associated with his discovery of gravity.';

export default function HowToWriteAQuestionPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 pt-6">
      <header>
        <p className="eyebrow">Better questions</p>
        <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight text-zinc-50">How to Write a Great Twiddl Question</h1>
        <p className="mt-5 text-lg leading-8 text-zinc-300">The best trivia questions don&apos;t just test what you know. They give you the thrill of figuring something out.</p>
        <p className="mt-4 leading-7 text-zinc-400">A great question makes you curious, gets you thinking, and rewards you with that wonderful moment when everything clicks. Here&apos;s how to write one.</p>
      </header>

      <section className="space-y-4">
        {principles.map((principle) => (
          <div key={principle.title} className="card p-5 md:p-6">
            <h2 className="text-lg font-bold tracking-tight text-zinc-100">{principle.title}</h2>
            <p className="mt-2 leading-7 text-zinc-400">{principle.body}</p>
          </div>
        ))}
      </section>

      <section className="card p-6 md:p-8">
        <p className="eyebrow">Here&apos;s an example</p>
        <p className="mt-3 text-sm italic leading-6 text-zinc-500">{exampleNote}</p>
        <p className="mt-5 text-lg leading-8 text-zinc-200">{exampleQuestion}</p>
        <p className="mt-6 text-2xl font-bold tracking-tight text-zinc-50">Who is he?</p>
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-300">Answer: Isaac Newton</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link className="button button-primary" href="/">Start asking <span className="ml-2 text-white/70">→</span></Link>
        <span className="text-xs text-zinc-500">One question a day. Make it a good one.</span>
      </div>
    </article>
  );
}