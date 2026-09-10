import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatRelativeDate } from '@/lib/utils';
import { currentQaStreak } from '@/lib/streak';
import ProfileButton from '@/components/profile-button';
import ProfileVisibilityToggle from '@/components/profile-visibility-toggle';
import type { Database } from '@/lib/database.types';

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProfilePage({ params }: Props) {
  const supabase = await createServerSupabase();
  const { username } = await params;

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

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold">{user.display_name}</h2>
            <p className="mt-2 text-slate-600">@{user.username}</p>
            <p className="mt-3 text-slate-700">{user.bio}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
              <div>
                <span className="font-semibold text-slate-900">{followers?.length ?? 0}</span> followers
              </div>
              <div>
                <span className="font-semibold text-slate-900">{following?.length ?? 0}</span> following
              </div>
              <div>
                <span className="font-semibold text-slate-900">{correctAnswers?.length ?? 0}</span> correct answers
              </div>
              <div>
                <span className="font-semibold text-slate-900">{qaStreak}</span> current Q&amp;A streak
              </div>
              <div>
                <span className="font-semibold text-slate-900">{user.is_public ? 'Public' : 'Private'}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/universe" className="button button-secondary">
              Back to universe
            </Link>
            {isCurrentUser ? <ProfileVisibilityToggle isPublic={user.is_public} /> : null}
            {!isCurrentUser ? <ProfileButton profileId={user.id} /> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h3 className="text-2xl font-semibold">Followers</h3>
          {!followers || followers.length === 0 ? (
            <p className="mt-4 text-slate-700">No one is following this user yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {followers.map((follower) => (
                <Link
                  key={follower.id}
                  href={`/profile/${follower.username}`}
                  className="block rounded-2xl border border-slate-200 p-4 hover:border-sky-500 transition"
                >
                  <p className="font-semibold">{follower.display_name}</p>
                  <p className="mt-1 text-sm text-slate-600">@{follower.username}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="text-2xl font-semibold">Following</h3>
          {!following || following.length === 0 ? (
            <p className="mt-4 text-slate-700">This user is not following anyone yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {following.map((followee) => (
                <Link
                  key={followee.id}
                  href={`/profile/${followee.username}`}
                  className="block rounded-2xl border border-slate-200 p-4 hover:border-sky-500 transition"
                >
                  <p className="font-semibold">{followee.display_name}</p>
                  <p className="mt-1 text-sm text-slate-600">@{followee.username}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h3 className="text-2xl font-semibold">Past questions</h3>
        {!typedUserQuestions || typedUserQuestions.length === 0 ? (
          <p className="mt-4 text-slate-700">This user has not asked any questions yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {typedUserQuestions.map((question) => (
              <Link key={question.id} href={`/questions/${question.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:border-sky-500 transition">
                <p className="font-semibold">{question.text}</p>
                <p className="mt-2 text-sm text-slate-500">{formatRelativeDate(question.created_at)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
