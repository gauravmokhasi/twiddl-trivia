'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthCard from '@/components/AuthCard';
import { useAuth } from '@/components/AuthProvider';

const sampleChoices: [string, string][] = [
  ['A', 'Jupiter'],
  ['B', 'Saturn'],
  ['C', 'Uranus'],
  ['D', 'Neptune'],
];

export default function LoggedOutLanding() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  // A sign-in link can land here with the session already in the browser, so refresh the
  // server render instead of flashing the signup form at an already signed-in user.
  useEffect(() => {
    if (!isLoading && session?.user?.id) {
      router.refresh();
    }
  }, [isLoading, session, router]);

  if (isLoading || session?.user?.id) {
    return (
      <div className="mx-auto max-w-md space-y-3 pt-24 text-center">
        <span className="mx-auto grid h-10 w-10 animate-pulse place-items-center rounded-xl bg-violet-500/20 text-sm font-black text-violet-200">T</span>
        <p className="text-sm text-zinc-500">Loading your Twiddl...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-12 pt-6 lg:grid-cols-2 lg:items-center lg:gap-16">
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500 text-base font-black text-white shadow-lg shadow-violet-500/20">T</span>
          <span className="text-lg font-bold tracking-tight text-zinc-100">Twiddl Trivia</span>
        </div>
        <div>
          <p className="eyebrow">One question a day</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-50 md:text-5xl">
            Ask one.
            <br />
            Answer a few.
            <br />
            See who actually knows their stuff.
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">You get one question to ask the club each day, and everyone else gets one question to ask you. Correct answers build the streak on your profile.</p>
        </div>
        <AuthCard />
      </section>

      {/* Decorative only: no data, no interactivity. */}
      <div className="relative mx-auto w-full max-w-md lg:max-w-none">
        <div className="pointer-events-none absolute -top-12 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />
        <span aria-hidden className="animate-float absolute -left-3 top-6 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-[#151519] text-lg font-black text-violet-300 shadow-xl">?</span>
        <span aria-hidden className="animate-float-slow absolute -right-2 top-32 grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-[#151519] text-base font-black text-violet-400/80 shadow-xl">?</span>

        <div className="animate-float relative rounded-3xl border border-white/[0.08] bg-[#151519] p-6 shadow-2xl shadow-violet-950/30">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Who knew?</span>
            <span className="badge badge-neutral">Today</span>
          </div>
          <p className="mt-6 text-2xl font-bold leading-tight tracking-tight text-zinc-50">This planet is so light it would float in water, and one of its moons has lakes of liquid methane.</p>
          <ul className="mt-6 space-y-2">
            {sampleChoices.map(([letter, choice]) => (
              <li key={letter} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-zinc-300">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-xs font-bold text-violet-200">{letter}</span>
                {choice}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-zinc-500">Somebody in the Twiddl universe got this one right today. Somebody else did not.</p>
        </div>

        <div className="animate-float-slow mt-5 hidden max-w-xs rounded-2xl border border-white/[0.08] bg-[#151519] p-4 shadow-xl sm:block">
          <p className="text-xs font-semibold text-violet-300">@maya asked</p>
          <p className="mt-1.5 text-sm text-zinc-300">This physicist&apos;s cat is famously both alive and dead in a thought experiment.</p>
          <p className="mt-3 text-xs font-semibold text-emerald-300">✓ Correct</p>
        </div>
      </div>
    </div>
  );
}