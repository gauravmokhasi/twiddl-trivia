import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedServerUser } from '@/lib/auth-server';
import { formatRelativeDate } from '@/lib/utils';
import { currentQaStreak } from '@/lib/streak';
import ProfileButton from '@/components/profile-button';
import ProfileEditor from '@/components/profile-editor';
import ProfileVisibilityToggle from '@/components/profile-visibility-toggle';
import AccuracyCheckToggle from '@/components/AccuracyCheckToggle';
import DeleteQuestionButton from '@/components/DeleteQuestionButton';
import TriviaSession from '@/components/TriviaSession';
import ProfileViewTracker from '@/components/ProfileViewTracker';
import TwiddlPulse from '@/components/TwiddlPulse';
import { buildPulseDays, PULSE_WINDOW_DAYS } from '@/lib/pulse';
import { profileQuestionCounts, unansweredSessionQuestions } from '@/lib/session-questions';
import { requireAskedToday } from '@/lib/daily-question-gate';
import { summarizeFollowList } from '@/lib/follower-lists';
import { hasBlocked, loadMyBlockedProfiles, withholdsQuestionsFrom } from '@/lib/user-blocks-server';
import { BlockButton, UnblockButton } from '@/components/block-button';

const ARCHIVE_PAGE_SIZE = 20;

type Props = {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    play?: string;
    view?: string;
    page?: string;
  }>;
};

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const { play, view, page } = await searchParams;

  // Verified identity for follow state and owner-only controls.
  const viewer = await getAuthenticatedServerUser();
  const currentUserId = viewer?.id;

  // Read profile using service-role client so RLS/permissions don't block server reads
  const { data: userData, error: userError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, bio, is_public, reengagement_emails_enabled')
    .eq('username', username)
    .single();
  const user = userData as {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    is_public: boolean;
    reengagement_emails_enabled: boolean;
  } | null;

  if (userError || !user) {
    notFound();
  }

  // Account settings remain available; other people's profiles still require today's question.
  await requireAskedToday({ profileOwnerId: user.id });

  // Two directions of one private relationship. The first withholds this
  // owner's questions from the viewer; the second only decides the Block button
  // label. Both fail in the safe direction and neither is ever shown to anyone
  // but the viewer themselves.
  const viewerBlockedFromOwner = await withholdsQuestionsFrom(user.id, currentUserId);
  let viewerHasBlockedOwner = false;
  if (currentUserId && currentUserId !== user.id) {
    try {
      viewerHasBlockedOwner = await hasBlocked(currentUserId, user.id);
    } catch {
      viewerHasBlockedOwner = false; // only affects the button's initial label
    }
  }

  // An unlisted profile is reachable by handle: it never appears in the Universe
  // (that listing filters on is_public) but anyone who has the username can still open it and
  // follow it, which is the point of sharing the handle.

  // Answering this user's questions is the default visit for signed-in visitors. The profile
  // page itself (counts, followers, archive, follow button) opens when the viewer asks for it
  // with ?view=profile, when there is nobody to answer as (signed out), or when the profile
  // belongs to the viewer. An unlisted profile keeps that profile-first default for viewers who
  // do not follow it yet, which is where the follow button lives; viewers who already follow it
  // are treated like any other profile. ?play=1 always starts answering.
  //
  // A blocked viewer never enters the answering flow: their questions are withheld, so the
  // profile view itself is what they get.
  let startAnswering = !viewerBlockedFromOwner && (user.is_public || play === '1');

  // Load this viewer's relation directly, independent of the followers list's row limit.
  let isFollowing = false;
  if (currentUserId && currentUserId !== user.id) {
    const { data: followRow, error: followError } = await supabaseAdmin
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('followee_id', user.id)
      .maybeSingle();
    if (followError) throw new Error('Unable to load follow state. Please try again.');
    isFollowing = Boolean(followRow);
    if (!viewerBlockedFromOwner && !startAnswering && view !== 'profile') startAnswering = isFollowing;
  }

  if (startAnswering && view !== 'profile' && currentUserId && currentUserId !== user.id) {
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
        {/* Answering someone's questions is still a visit to their profile, and for a
            public profile it is the default landing view - so it counts as one too. */}
        <ProfileViewTracker profileUserId={user.id} isOwnProfile={currentUserId === user.id} />
        <TriviaSession
          key={`profile:${user.id}:${questions.map((question) => question.id).join(',')}`}
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

  // Fetch questions and follow relations using admin client.
  // The archive is paged (bounded range + count); the stat queries below stay
  // unbounded because streak/pulse need full date sets - revisit if profiles
  // ever grow to thousands of rows (server-side date truncation then).
  const archivePage = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
  const archiveFrom = (archivePage - 1) * ARCHIVE_PAGE_SIZE;
  const archiveTo = archiveFrom + ARCHIVE_PAGE_SIZE - 1;
  const [{ data: userQuestions, count: archiveCount }, { data: followerRelations }, { data: followingRelations }, { count: correctAnswerCount }, { data: askedDates }, { data: answeredDates }] = await Promise.all([
    // A blocked viewer gets neither rows nor a count: the archive is withheld
    // before it can be counted or rendered.
    viewerBlockedFromOwner
      ? Promise.resolve({ data: [] as { id: string; text: string; created_at: string }[], count: null as number | null })
      : supabaseAdmin
        .from('questions')
        .select('id, text, created_at', { count: 'exact' })
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .range(archiveFrom, archiveTo),
    supabaseAdmin.from('follows').select('follower_id').eq('followee_id', user.id),
    supabaseAdmin.from('follows').select('followee_id').eq('follower_id', user.id),
    supabaseAdmin
      .from('answers')
      .select('id', { count: 'exact', head: true })
      .eq('responder_id', user.id)
      .eq('is_correct', true),
    supabaseAdmin.from('questions').select('id, text, image_url, created_at').eq('author_id', user.id),
    supabaseAdmin.from('answers').select('created_at').eq('responder_id', user.id),
  ]);

  const archiveTotalPages = Math.max(1, Math.ceil((archiveCount ?? 0) / ARCHIVE_PAGE_SIZE));

  const typedAskedDates = askedDates as { created_at: string }[] | null;
  const typedAnsweredDates = answeredDates as { created_at: string }[] | null;
  const typedUserQuestions = userQuestions as { id: string; text: string; image_url: string | null; created_at: string }[] | null;

  const qaStreak = currentQaStreak(
    typedAskedDates?.map((item) => item.created_at) ?? [],
    typedAnsweredDates?.map((item) => item.created_at) ?? [],
  );

  const typedFollowerRelations = followerRelations as { follower_id: string }[] | null;
  const typedFollowingRelations = followingRelations as { followee_id: string }[] | null;
  const followerIds = typedFollowerRelations?.map((item) => item.follower_id) ?? [];
  const followingIds = typedFollowingRelations?.map((item) => item.followee_id) ?? [];

  const isCurrentUser = currentUserId === user.id;

  // The owner sees their own lists in full. Anyone else sees only listed profiles:
  // the withheld ones are reduced to a head-only count, so an unlisted identity
  // never reaches the browser at all. The relation ids above stay server-side.
  const profileColumns = 'id, username, display_name';
  const visibleFollowProfiles = (ids: string[]) => {
    const query = supabaseAdmin.from('profiles').select(profileColumns).in('id', ids);
    return isCurrentUser ? query : query.eq('is_public', true);
  };
  const withheldFollowProfileCount = (ids: string[]) =>
    supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('id', ids)
      .eq('is_public', false);

  const [
    { data: followerRows },
    { data: followingRows },
    { count: withheldFollowerCount },
    { count: withheldFollowingCount },
  ] = await Promise.all([
    followerIds.length > 0 ? visibleFollowProfiles(followerIds) : Promise.resolve({ data: [] }),
    followingIds.length > 0 ? visibleFollowProfiles(followingIds) : Promise.resolve({ data: [] }),
    isCurrentUser || followerIds.length === 0
      ? Promise.resolve({ count: null as number | null })
      : withheldFollowProfileCount(followerIds),
    isCurrentUser || followingIds.length === 0
      ? Promise.resolve({ count: null as number | null })
      : withheldFollowProfileCount(followingIds),
  ]);

  const followers = (followerRows ?? []) as { id: string; username: string; display_name: string }[];
  const following = (followingRows ?? []) as { id: string; username: string; display_name: string }[];

  // The header keeps showing the true total, so "listed + unlisted" still adds up.
  const followersSummary = summarizeFollowList({
    visibleCount: followers.length,
    hiddenCount: withheldFollowerCount ?? 0,
  });
  const followingSummary = summarizeFollowList({
    visibleCount: following.length,
    hiddenCount: withheldFollowingCount ?? 0,
  });

  // Only ever the caller's own block list, and only while they are looking at
  // their own profile. Never fetched for anyone else's profile.
  const blockedProfiles = isCurrentUser && currentUserId ? await loadMyBlockedProfiles(currentUserId) : [];

  const profileCounts = currentUserId && !isCurrentUser && !viewerBlockedFromOwner
    ? await profileQuestionCounts(user.id, currentUserId)
    : null;
  const unansweredCount = profileCounts?.unanswered ?? 0;

  // Twiddl Pulse reuses the asked/answered timestamps already loaded above and adds one aggregate
  // query: answers left by OTHER people on this user's questions, within the displayed window.
  // Scoped to this profile, bounded by date, and only the two columns needed. It is wrapped so a
  // failure here can never break the rest of the profile page.
  const windowStart = new Date(new Date().getTime() - (PULSE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString();
  let receivedAnswerDates: string[] = [];

  try {
    const { data: receivedAnswers, error: receivedError } = await (supabaseAdmin
      .from('answers') as any)
      .select('created_at, responder_id, questions!inner(author_id)')
      .eq('questions.author_id', user.id)
      .neq('responder_id', user.id)
      .gte('created_at', windowStart);

    if (receivedError) {
      console.warn(`[pulse] received-answer lookup failed for ${user.username}: ${receivedError.message}`);
    } else {
      receivedAnswerDates = ((receivedAnswers ?? []) as { created_at: string }[]).map((row) => row.created_at);
    }
  } catch (pulseError) {
    console.warn(`[pulse] received-answer lookup threw for ${user.username}: ${pulseError instanceof Error ? pulseError.message : 'unknown error'}`);
  }

  const pulseDays = buildPulseDays({
    askedDates: typedAskedDates?.map((item) => item.created_at) ?? [],
    answeredDates: typedAnsweredDates?.map((item) => item.created_at) ?? [],
    receivedDates: receivedAnswerDates,
  });

  return (
    <div className="space-y-6">
      <ProfileViewTracker profileUserId={user.id} isOwnProfile={isCurrentUser} />
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-violet-500/15 text-3xl font-bold text-violet-200">{user.username.charAt(0).toUpperCase()}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-zinc-100">{user.display_name}</h2>
                <span className="badge badge-neutral">{user.is_public ? 'Public' : 'Unlisted'}</span>
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
            {profileCounts && unansweredCount === 0 && profileCounts.total > 0 ? (
              <span className="text-xs text-zinc-500">You have answered all {profileCounts.total} of their questions.</span>
            ) : null}
            {!isCurrentUser ? <ProfileButton key={`${currentUserId}:${user.id}:${isFollowing}`} profileId={user.id} viewerId={currentUserId ?? null} initialIsFollowing={isFollowing} /> : null}
            {!isCurrentUser && currentUserId ? <BlockButton profileId={user.id} initialIsBlocked={viewerHasBlockedOwner} /> : null}
          </div>
        </div>
        {isCurrentUser ? <ProfileEditor displayName={user.display_name} bio={user.bio} /> : null}
        {isCurrentUser ? <AccuracyCheckToggle /> : null}
      </section>

      <section className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Following</h3><span className="text-sm text-zinc-500">{followingSummary.total}</span></div>
          {followingSummary.isEmpty ? (
            <p className="mt-4 text-slate-700">This user is not following anyone yet.</p>
          ) : (
            <>
              {following.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {following.map((followee) => (
                    <Link key={followee.id} href={`/profile/${followee.username}`} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 hover:text-violet-300">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-sm font-bold text-violet-200">{followee.username.charAt(0).toUpperCase()}</span>
                      <span><span className="block text-sm font-semibold text-zinc-200">{followee.display_name}</span><span className="block text-xs text-zinc-500">@{followee.username}</span></span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {followingSummary.unlistedLabel ? (
                <p className="mt-4 text-sm text-zinc-500">{followingSummary.unlistedLabel}</p>
              ) : null}
            </>
          )}
        </div>

        <div id="followers" className="card p-5 scroll-mt-24">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Followers</h3><span className="text-sm text-zinc-500">{followersSummary.total}</span></div>
          {followersSummary.isEmpty ? (
            <p className="mt-4 text-slate-700">No one is following this user yet.</p>
          ) : (
            <>
              {followers.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {followers.map((follower) => (
                    <Link key={follower.id} href={`/profile/${follower.username}`} className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0 hover:text-violet-300">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-sm font-bold text-violet-200">{follower.username.charAt(0).toUpperCase()}</span>
                      <span><span className="block text-sm font-semibold text-zinc-200">{follower.display_name}</span><span className="block text-xs text-zinc-500">@{follower.username}</span></span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {followersSummary.unlistedLabel ? (
                <p className="mt-4 text-sm text-zinc-500">{followersSummary.unlistedLabel}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="card p-5 md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Usage</h3></div>
          <div className="mt-4 grid grid-cols-2 gap-4 border-b border-white/[0.07] pb-5">
            <div className="stat"><strong>{correctAnswerCount ?? 0}</strong><span>Correct</span></div>
            <div className="stat"><strong>{qaStreak}</strong><span>Q&amp;A streak</span></div>
          </div>
          <div className="mt-5">
            <TwiddlPulse activity={pulseDays} bare />
          </div>
        </div>
      </section>

      {/* Private to the owner: only their own block list, and only on their own profile. */}
      {isCurrentUser ? (
        <section className="card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-100">Blocked users</h3>
            <span className="text-sm text-zinc-500">{blockedProfiles.length}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            A blocked person cannot follow you or see your questions. Unblocking does not restore a
            follow that was removed.
          </p>
          {blockedProfiles.length === 0 ? (
            <p className="mt-4 text-slate-700">You have not blocked anyone.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {blockedProfiles.map((blocked) => (
                <li key={blocked.id} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-3 last:border-0">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-sm font-bold text-violet-200">{blocked.username.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-200">{blocked.display_name ?? blocked.username}</span>
                      <span className="block truncate text-xs text-zinc-500">@{blocked.username}</span>
                    </span>
                  </span>
                  <UnblockButton profileId={blocked.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="card p-5 md:p-6">
        <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-zinc-100">Past questions</h3><span className="text-sm text-zinc-500">{isCurrentUser ? 'Your archive' : 'Their archive'}</span></div>
        {!typedUserQuestions || typedUserQuestions.length === 0 ? (
          <p className="mt-4 text-slate-700">{archivePage > 1 ? 'Nothing on this page.' : 'This user has not asked any questions yet.'}</p>
        ) : (
          <div className="mt-4 space-y-4">
            {typedUserQuestions.map((question) => (
              <div key={question.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] py-4 last:border-0">
                <Link href={`/questions/${question.id}`} className="min-w-0 flex-1 transition hover:text-violet-300">
                  <div className="flex flex-col gap-2">
                    {question.image_url ? (
                      <img src={question.image_url} alt="Question image" className="max-h-40 max-w-full rounded-xl border border-white/[0.12] object-cover" />
                    ) : null}
                    <p className="font-semibold text-zinc-200">{question.text}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatRelativeDate(question.created_at)}</p>
                  </div>
                </Link>
                {/* Only the author sees this, and the API refuses anything younger than a day. */}
                {isCurrentUser ? <DeleteQuestionButton questionId={question.id} /> : null}
              </div>
            ))}
          </div>
        )}
        {archiveTotalPages > 1 ? (
          <nav className="flex items-center justify-center gap-3 pt-4" aria-label="Archive pages">
            {archivePage > 1 ? (
              <Link href={archivePage === 2 ? `/profile/${user.username}?view=profile` : `/profile/${user.username}?view=profile&page=${archivePage - 1}`} className="button button-secondary text-sm">
                ← Newer
              </Link>
            ) : null}
            <span className="text-sm text-zinc-500">Page {Math.min(archivePage, archiveTotalPages)} of {archiveTotalPages}</span>
            {archivePage < archiveTotalPages ? (
              <Link href={`/profile/${user.username}?view=profile&page=${archivePage + 1}`} className="button button-secondary text-sm">
                Older →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
