import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import SupabaseProvider from '@/components/SupabaseProvider';
import AuthStatus from '@/components/AuthStatus';
import ProfileSync from '@/components/ProfileSync';
import NavLinks from '@/components/NavLinks';
import AnalyticsIdentity from '@/components/AnalyticsIdentity';
import ActivityTracker from '@/components/ActivityTracker';
import { getDailyQuestionGate } from '@/lib/daily-question-gate';
import { digestLatestAt, loadNotificationDigest } from '@/lib/notifications-server';

export const metadata: Metadata = {
  title: 'Twiddl Trivia',
  description: 'Social quiz app prototype for questions, followers, and discoverable profiles.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Social navigation is gated until today's question is asked; account controls stay available.
  const { locked, userId } = await getDailyQuestionGate();

  // One lightweight digest load for the nav dot only; the page itself loads
  // the full digest. Signed-out visitors and failures simply show no dot.
  let notificationsLatestAt: string | null = null;
  if (userId && !locked) {
    try {
      notificationsLatestAt = digestLatestAt(await loadNotificationDigest(userId));
    } catch {
      notificationsLatestAt = null;
    }
  }

  return (
    <html lang="en">
      <body>
        <SupabaseProvider>
          <ProfileSync />
          {/* Renders null; only keeps PostHog's identity aligned with the Supabase session. */}
          <AnalyticsIdentity />
          {/* Renders null; records that a signed-in session is really being used. */}
          <ActivityTracker />
          <div className="container">
            <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.06] bg-[#09090b]/85 px-4 backdrop-blur-xl md:-mx-6 md:px-6">
              <div className="flex min-h-[4.25rem] flex-col justify-center gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Link href="/" className="group flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500 text-sm font-black text-white shadow-lg shadow-violet-500/20">T</span>
                    <span>
                      <span className="block text-sm font-bold tracking-tight text-zinc-100">Twiddl Trivia</span>
                      <span className="block text-[11px] font-medium text-zinc-500">Your daily mental workout</span>
                    </span>
                  </Link>
                  <AuthStatus />
                </div>
                <nav aria-label="Main navigation" className="flex max-w-full flex-wrap items-center gap-1 rounded-xl bg-white/[0.03] p-1 text-sm font-semibold text-zinc-500">
                  <NavLinks locked={locked} initialViewerId={userId} notificationsLatestAt={notificationsLatestAt} />
                </nav>
              </div>
              {locked ? (
                <p id="daily-question-lock-help" className="pb-3 text-xs text-zinc-400">
                  Ask today’s question from Feed to unlock trivia, Universe, Explore, and Notifications. Your profile and account controls are available.
                </p>
              ) : null}
            </header>
            <main>{children}</main>
          </div>
        </SupabaseProvider>
      </body>
    </html>
  );
}
