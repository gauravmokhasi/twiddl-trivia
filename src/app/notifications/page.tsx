import Link from 'next/link';
import { getAuthenticatedServerUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAskedToday } from '@/lib/daily-question-gate';
import { digestLatestAt, loadNotificationDigest } from '@/lib/notifications-server';
import NotificationList from '@/components/NotificationList';

export const metadata = {
  title: 'Notifications',
};

export default async function NotificationsPage() {
  // Off limits until today's question has been asked. Signed-out visitors fall through unchanged.
  await requireAskedToday();

  const viewer = await getAuthenticatedServerUser();

  if (!viewer?.id) {
    return (
      <section className="card mx-auto max-w-2xl p-6 pt-8 md:p-8">
        <p className="eyebrow">Notifications</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100">Sign in to see your recap</h2>
        <p className="mt-2 text-zinc-400">A daily recap of what&apos;s happening around your Twiddls.</p>
        <Link className="button button-primary mt-5" href="/login">Sign in</Link>
      </section>
    );
  }

  const [days, profileData] = await Promise.all([
    loadNotificationDigest(viewer.id),
    supabaseAdmin.from('profiles').select('username').eq('id', viewer.id).maybeSingle(),
  ]);
  const ownUsername = (profileData.data as { username: string } | null)?.username ?? '';
  const latestAt = digestLatestAt(days);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-6">
      <section>
        <p className="eyebrow">Daily recap</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">Notifications</h2>
        <p className="mt-2 text-zinc-400">A daily recap of what&apos;s happening around your Twiddls.</p>
      </section>

      <NotificationList days={days} ownUsername={ownUsername} />

      {/* Preload hook for the nav dot: reading last-seen happens client-side. */}
      <span data-notifications-latest={latestAt ?? ''} hidden />
    </div>
  );
}
