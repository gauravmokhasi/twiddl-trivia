'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createFollowAction, initialFollowState, saveFollowState } from '@/lib/follow-action';

type Props = {
  profileId: string;
  viewerId: string | null;
  initialIsFollowing: boolean;
};

export default function ProfileButton({ profileId, viewerId, initialIsFollowing }: Props) {
  const [state, setState] = useState(() => initialFollowState(initialIsFollowing));
  const [toggleFollow] = useState(() => createFollowAction(initialIsFollowing, setState, (next) => saveFollowState(profileId, next)));

  if (viewerId === profileId) return null;
  if (!viewerId) return <Link href="/login" className="button button-primary">Sign in to follow</Link>;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`button ${state.isFollowing ? 'button-secondary' : 'button-primary'}`}
        onClick={toggleFollow}
        disabled={state.pending}
        aria-pressed={state.isFollowing}
        aria-busy={state.pending}
      >
        {state.isFollowing ? 'Following' : 'Follow'}
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-zinc-400">
        {state.pending ? 'Saving...' : state.message}
      </p>
    </div>
  );
}
