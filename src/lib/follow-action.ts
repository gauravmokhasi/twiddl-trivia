export type FollowState = {
  isFollowing: boolean;
  pending: boolean;
  message: string;
};

export function initialFollowState(isFollowing: boolean): FollowState {
  return { isFollowing, pending: false, message: '' };
}

/** One in-flight change per button, with immediate feedback and rollback on failure. */
export function createFollowAction(
  initialIsFollowing: boolean,
  notify: (state: FollowState) => void,
  save: (isFollowing: boolean) => Promise<void>,
) {
  let state = initialFollowState(initialIsFollowing);
  const publish = (next: FollowState) => { state = next; notify(next); };

  return async () => {
    if (state.pending) return;
    const previous = state.isFollowing;
    const next = !previous;
    publish({ isFollowing: next, pending: true, message: '' });
    try {
      await save(next);
      publish({ isFollowing: next, pending: false, message: next ? 'Followed successfully.' : 'Unfollowed successfully.' });
    } catch (error) {
      publish({
        isFollowing: previous,
        pending: false,
        message: error instanceof Error ? error.message : 'Unable to update follow state. Please try again.',
      });
    }
  };
}

export async function saveFollowState(profileId: string, isFollowing: boolean): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/follow', {
      method: isFollowing ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followeeId: profileId }),
    });
  } catch {
    throw new Error('Could not connect. Please try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to update follow state. Please try again.');
  }
}
