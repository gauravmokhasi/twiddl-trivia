import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatRelativeDate } from '@/lib/utils';
import { currentQaStreak } from '@/lib/streak';
import ProfileButton from '@/components/profile-button';
import ProfileEditor from '@/components/profile-editor';
import ProfileVisibilityToggle from '@/components/profile-visibility-toggle';
import TriviaSession from '@/components/TriviaSession';
import { countUnansweredQuestions, unansweredSessionQuestions } from '@/lib/session-questions';
import type { Database } from '@/lib/database.types';

type Props = {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    play?: string;
    view?: string;
  }>;
};

export default async function ProfilePage({ params, searchParams }: Props) {
  const supabase = await createServerSupabase();
  const { username } = await params;
  const { view } = await searchParams;

  // get session to determine the current user
  const { data: { session } } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id;

  // Read profile using service-role client so RLS/permissions don't block server reads
  const { data: userData, error: userError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, bio, is_public')
    .eq('username', username)
    .single();
  const user = userData as { id: string; username: string; display_name: string | null; bio: string | null; is_public: boolean } | null;

  if (userError || !user) {
    notFound();
  }

  // If profile is private and requester is not owner, show 404
  if (!user.is_public && currentUserId !== user.id) {
    notFound();
  }

  // Answering this user's questions is the default visit for signed-in visitors. The profile
  // itself (counts, followers, archive) opens when the viewer asks for it with ?view=profile,
  // or when there is nobody to answer as (signed out) or the profile belongs to the viewer.
  // (?play=1 still works as an explicit "start answering" link.)
  if (view !== 'profile' && currentUserId && currentUserId !== user.id) {
    const backToProfile = (
      <section className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 pt-6">
        <Link href={`/profile/${user.username}?view=profile`} className="button button-ghost text-sm">← Back to @{user.username}&apos;s profile</Link>
        <span className="text-xs text-zinc-500">Their questions, one at a time</span>
      </section>
    );

    const questions = await unansweredSessionQuestions({ userId: currentUserId, authorIds: [user.id] });

    return (
      <div>
        {backToProfile}
        <TriviaSession
          questions={questions}
          headerLabel={`@${user.username} asked`}
          endState={{
            eyebrow: 'All caught up',
            title: `You are caught up on @${user.username}.`,
            message: `You have answered every question @${user.username} has ever asked.`,
            primaryLabel: 'Back to their profile',
            primaryHref: `/profile/${user.username}?view=profile`,
            secondaryLabel: 'Explore unanswered questions',
            secondaryHref: '/explore',
          }}
        />
      </div>
    );
  }

  // Fetch questions and follow relations using admin client
  const [{ data: userQuestions }, { data: followerRelations }, { data: followingRelations }, { data: correctAnswers }, { data: askedDates }, { data: answeredDates }] = await Promise.all([
    supabaseAdmin
      .from('questions')
      .select('id, text, created_at')
      .eq('author_id', user.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('follows').select('follower_id').eq('followee_id', user.id),
    supabaseAdmin.from('follows').select('followee_id').eq('follower_id', user.id),
    supabaseAdmin
      .from('answers')
      .select('id', { count: 'exact' })
      .eq('responder_id', user.id)
      .eq('is_correct', true),
    supabaseAdmin.from('questions').select('created_at').eq('author_id', user.id),
    supabaseAdmin.from('answers').select('created_at').eq('responder_id', user.id),
  ]);

  const typedAskedDates = askedDates as { created_at: string }[] | null;
  const typedAnsweredDates = answeredDates as { created_at: string }[] | null;
  const typedUserQuestions = userQuestions as { id: string; text: string; created_at: string }[] | null;

  const qaStreak = currentQaStreak(
    typedAskedDates?.map((item) => item.created_at) ?? [],
    typedAnsweredDates?.map((item) => item.created_at) ?? [],
  );

  const typedFollowerRelations = followerRelations as { follower_id: string }[] | null;
  const typedFollowingRelations = followingRelations as { followee_id: string }[] | null;
  const followerIds = typedFollowerRelations?.map((item) => item.follower_id) ?? [];
  const followingIds = typedFollowingRelations?.map((item) => item.followee_id) ?? [];

  const [{ data: followers }, { data: following }] = await Promise.all([
    followerIds.length > 0
      ? supabaseAdmin.from('profiles').select('id, username, display_name').in('id', followerIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string }[] }),
    followingIds.length > 0
      ? supabaseAdmin.from('profiles').select('id, username, display_name').in('id', followingIds)
      : Promise.resolve({ data: [] as { id: string; username: string; display_name: string }[] }),
  ]);

  const isCurrentUser = currentUserId === user.id;
  const unansweredCount = currentUserId && !isCurrentUser && typedUserQuestions && typedUserQuestions.length > 0
    ? await countUnansweredQuestions(currentUserId, typedUserQuestions.map((question) => question.id))
    : 0;

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-violet-500/15 text-3xl font-bold text-violet-200">{user.username.charAt(0).toUpperCase()}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-zinc-100">{user.display_name}</h2>
                <span className="badge badge-neutral">{user.is_public ? 'Public' : 'Private'}</span>
              </div>
              <p className="mt-1 text-sm text-violet-300">@{user.username}</p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{user.bio || 'A curious mind in the Twiddl universe.'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/universe" className="button button-ghost text-sm">← Universe</Link>
            {isCurrentUser ? <ProfileVisibilityToggle isPublic={user.is_public} /> : null}
            {!isCurrentUser && unansweredCount > 0 ? (
              <Link href={`/profile/${user.username}?play=1`} className="button button-primary text-sm">
                Answer {unansweredCount} question{unansweredCount === 1 ? '' : 's'} →
              </Link>
            ) : null}
            {!isCurrentUser && unansweredCount === 0 && (typedUserQuestions?.length ?? 0) > 0 ? (
              <span className="text-xs text-zinc-500">You have answered all {typedUserQuestions?.length} of their questions.</span>
            ) : null}
            {!isCurrentUser ? <ProfileButton profileId={user.id} /> : null}
          </div>
        </div>
        {isCurrentUser ? <ProfileEditor displayName={user.display_name} bio={user.bio} /> : null}
        <div className="relative mt-8 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-4">
          <div className="stat"><strong>{followers?.length ?? 0}</strong><span>Followers</span></div>
          <div className="stat"><strong>{following?.length ?? 0}</strong><span>Following</span></div>
          <div className="stat"><strong>{correctAnswers?.length ?? 0}</strong><span>Correct</span></div>
          <div className="stat"><strong>{qaStreak}</strong><span>Q&amp;A streak</span></div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Followers</h3><span className="text-sm text-zinc-500">{followers?.length ?? 0}</span></div>
          {!followers || followers.length === 0 ? (
            <p className="mt-4 text-slate-700">No one is following this user yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {followers.map((follower) => (
                <Link key={follower.id} href={`/profile/${follower.username}`} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 hover:text-violet-300">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-sm font-bold text-violet-200">{follower.username.charAt(0).toUpperCase()}</span>
                  <span><span className="block text-sm font-semibold text-zinc-200">{follower.display_name}</span><span className="block text-xs text-zinc-500">@{follower.username}</span></span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Following</h3><span className="text-sm text-zinc-500">{following?.length ?? 0}</span></div>
          {!following || following.length === 0 ? (
            <p className="mt-4 text-slate-700">This user is not following anyone yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {following.map((followee) => (
                <Link key={followee.id} href={`/profile/${followee.username}`} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 hover:text-violet-300">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-sm font-bold text-violet-200">{followee.username.charAt(0).toUpperCase()}</span>
                  <span><span className="block text-sm font-semibold text-zinc-200">{followee.display_name}</span><span className="block text-xs text-zinc-500">@{followee.username}</span></span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card p-5 md:p-6">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Past questions</h3><span className="text-sm text-zinc-500">Your archive</span></div>
        {!typedUserQuestions || typedUserQuestions.length === 0 ? (
          <p className="mt-4 text-slate-700">This user has not asked any questions yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {typedUserQuestions.map((question) => (
              <Link key={question.id} href={`/questions/${question.id}`} className="block border-b border-white/[0.06] py-4 last:border-0 hover:text-violet-300 transition">
                <p className="font-semibold text-zinc-200">{question.text}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatRelativeDate(question.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
