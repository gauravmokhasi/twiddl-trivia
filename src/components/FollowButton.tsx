'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

type Props = {
  followeeId: string;
  initialIsFollowing: boolean;
};

export default function FollowButton({ followeeId, initialIsFollowing }: Props) {
  const { session } = useAuth();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = async () => {
    if (!session?.user?.id) {
      setMessage('Please sign in to follow users.');
      return;
    }

    setIsSaving(true);
    setMessage('');

    const method = isFollowing ? 'DELETE' : 'POST';
    const response = await fetch('/api/follow', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followeeId }),
    });

    const data = await response.json();
    setIsSaving(false);

    if (!response.ok) {
      setMessage(data?.error || 'Unable to update follow state.');
      return;
    }

    setIsFollowing(!isFollowing);
    setMessage(isFollowing ? 'Unfollowed successfully.' : 'Followed successfully.');
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`button ${isFollowing ? 'button-secondary' : 'button-primary'}`}
        onClick={handleToggle}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : isFollowing ? 'Unfollow' : 'Follow'}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
