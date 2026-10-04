'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

type Props = {
  /** True for a signed-in member who still owes today's question. */
  locked: boolean;
};

const ITEMS = [
  { href: '/', label: 'Feed' },
  { href: '/universe', label: 'Universe' },
  { href: '/explore', label: 'Explore' },
];

const LINK_CLASS = 'rounded-lg px-3 py-2 transition hover:bg-white/[0.06] hover:text-zinc-100';
const ACCENT_LINK_CLASS = 'rounded-lg bg-violet-500/20 px-3 py-2 text-violet-100 ring-1 ring-inset ring-violet-400/40 transition hover:bg-violet-500/30 hover:text-white';
const LOCKED_CLASS = 'cursor-not-allowed rounded-lg px-3 py-2 text-zinc-600';
const LOCKED_HINT = 'Ask your question for today to unlock this';

/**
 * Header navigation. When the member still owes today's question the links render as inert text
 * rather than anchors, so there is nothing to click and no URL to copy.
 */
export default function NavLinks({ locked }: Props) {
  const { session } = useAuth();
  const items = session?.user?.id ? [...ITEMS, { href: '/profile', label: 'Profile' }] : ITEMS;

  return (
    <>
      {items.map((item) => {
        if (locked) {
          return (
            <span key={item.href} aria-disabled="true" title={LOCKED_HINT} className={LOCKED_CLASS}>
              {item.label}
            </span>
          );
        }

        return (
          <Link key={item.href} href={item.href} className={item.href === '/explore' ? ACCENT_LINK_CLASS : LINK_CLASS}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}