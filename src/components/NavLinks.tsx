'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isNavigationActive } from '@/lib/navigation';
import { isNavigationLocked } from '@/lib/daily-question-access';

type Props = {
  /** True for a signed-in member who still owes today's question. */
  locked: boolean;
  initialViewerId: string | null;
  /** Newest digest activity at server render, for the "new since last visit" dot. */
  notificationsLatestAt?: string | null;
};

const ITEMS = [
  { href: '/', label: 'Feed' },
  { href: '/universe', label: 'Universe' },
  { href: '/explore', label: 'Explore' },
  { href: '/notifications', label: 'Notifications' },
];

const LAST_SEEN_STORAGE_KEY = 'twiddl-notifications-last-seen';

const LINK_CLASS = 'inline-flex min-h-11 items-center rounded-lg px-3 py-2 transition hover:bg-white/[0.06] hover:text-zinc-100';
const ACTIVE_LINK_CLASS = 'inline-flex min-h-11 items-center rounded-lg bg-violet-500/20 px-3 py-2 text-violet-100 ring-1 ring-inset ring-violet-400/40 transition hover:bg-violet-500/30 hover:text-white';
const LOCKED_CLASS = 'inline-flex min-h-11 items-center cursor-not-allowed rounded-lg px-3 py-2 text-zinc-600';

// localStorage has no same-tab change event, so there is nothing to subscribe
// to; the snapshot is re-read on every render instead (each navigation).
function subscribeLastSeen() {
  return () => {};
}

function readLastSeenSnapshot(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Server and hydration render share this, so the dot never mismatches.
function readLastSeenServerSnapshot(): string | null {
  return null;
}

/**
 * Header navigation. Social links are disabled until today's question is asked;
 * the composer and the member's own account stay reachable.
 */
export default function NavLinks({ locked, initialViewerId, notificationsLatestAt }: Props) {
  const { session, isLoading } = useAuth();
  const pathname = usePathname();
  // Re-read on every render (each navigation re-renders this component via
  // usePathname), so the dot clears right after you view Notifications instead
  // of only on the next full page load. No setState, so no cascading renders.
  const lastSeen = useSyncExternalStore(subscribeLastSeen, readLastSeenSnapshot, readLastSeenServerSnapshot);

  const viewerId = isLoading ? initialViewerId : session?.user?.id;
  const items = viewerId ? [...ITEMS, { href: '/profile', label: 'Profile' }] : ITEMS;

  // Dot means "activity newer than your last visit to Notifications". Viewing
  // the page writes last-seen, which the snapshot above picks up on the next
  // navigation.
  const showDot = pathname !== '/notifications'
    && Boolean(notificationsLatestAt)
    && (!lastSeen || notificationsLatestAt! > lastSeen);

  return (
    <>
      {items.map((item) => {
        if (isNavigationLocked(locked, item.href)) {
          return (
            <span key={item.href} aria-disabled="true" aria-describedby="daily-question-lock-help" className={LOCKED_CLASS}>
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isNavigationActive(pathname, item.href) ? ACTIVE_LINK_CLASS : LINK_CLASS}
            aria-current={isNavigationActive(pathname, item.href) ? 'page' : undefined}
          >
            {item.label}
            {item.href === '/notifications' && showDot ? (
              <span aria-label="New activity" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle" />
            ) : null}
          </Link>
        );
      })}
    </>
  );
}