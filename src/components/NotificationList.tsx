'use client';

import Link from 'next/link';
import {
  describeAnswerCount,
  describeFollowCount,
  describeReportCount,
  type DigestDay,
  type DigestItem,
} from '@/lib/notifications';
import { formatRelativeDate } from '@/lib/utils';

const LAST_SEEN_STORAGE_KEY = 'twiddl-notifications-last-seen';

function itemHref(item: DigestItem, ownUsername: string): string {
  if (item.kind === 'follows') return `/profile/${ownUsername}?view=profile#followers`;
  return `/questions/${item.questionId}`;
}

function itemMonogram(item: DigestItem): string {
  if (item.kind === 'follows') {
    return (item.sampleFollowerUsernames[0]?.charAt(0) ?? 'T').toUpperCase();
  }
  if (item.kind === 'reports') return '!';
  return (item.sampleResponderUsernames[0]?.charAt(0) ?? '?').toUpperCase();
}

function itemHeadline(item: DigestItem): string {
  if (item.kind === 'answers') return describeAnswerCount(item.count);
  if (item.kind === 'reports') return describeReportCount(item.count);
  return describeFollowCount(item.count, item.sampleFollowerUsernames);
}

export default function NotificationList({ days, ownUsername }: { days: DigestDay[]; ownUsername: string }) {
  // Remember this visit so the nav dot can mean "new since you last looked".
  // Runs after render; failures (private browsing) simply skip the write.
  if (typeof window !== 'undefined') {
    try {
      const latest = days.flatMap((day) => day.items).map((item) => item.latestAt).sort().at(-1);
      window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, latest ?? new Date().toISOString());
    } catch {
      // Ignore: the dot just stays on.
    }
  }

  if (days.length === 0) {
    return (
      <section className="card mx-auto max-w-2xl p-6 text-center md:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 text-xl font-black text-violet-200">T</span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-zinc-50">All quiet in the universe.</h2>
        <p className="mx-auto mt-2 max-w-md text-zinc-400">Ask a great question and give people something to argue about.</p>
        <Link className="button button-primary mt-5" href="/">Back to Twiddl</Link>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <section key={day.day}>
          <p className="eyebrow">{day.label}</p>
          <ul className="card mt-3 divide-y divide-white/[0.06] p-0">
            {day.items.map((item) => {
              const key = item.kind === 'follows' ? `follows:${day.day}` : `${item.kind}:${item.questionId}:${day.day}`;
              return (
                <li key={key}>
                  <Link href={itemHref(item, ownUsername)} className="group flex items-center gap-4 p-4 transition hover:bg-white/[0.03] md:px-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-sm font-bold text-violet-200">
                      {itemMonogram(item)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-100">{itemHeadline(item)}</span>
                      {item.kind !== 'follows' ? (
                        <span className="mt-0.5 block truncate text-sm text-zinc-400">&ldquo;{item.questionText}&rdquo;</span>
                      ) : null}
                      <span className="mt-1 block text-xs text-zinc-500">{formatRelativeDate(item.latestAt)}</span>
                    </span>
                    <span aria-hidden className="shrink-0 text-lg text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-violet-300">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
