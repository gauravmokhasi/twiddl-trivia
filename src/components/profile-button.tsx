'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

type Props = {
  profileId: string;
};

export default function ProfileButton({ profileId }: Props) {
  const { session } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadStatus = async () => {
      if (!session?.user?.id) {
        setIsLoading(false);
        return;
      }

      if (session.user.id === profileId) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/follow/status?followeeId=${profileId}`);
      const data = await response.json();
      setIsFollowing(Boolean(data.isFollowing));
      setIsLoading(false);
    };
    loadStatus();
  }, [profileId, session]);

  if (isLoading) {
    return <div className="text-sm text-slate-600">Loading follow status...</div>;
  }

  if (session?.user?.id === profileId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`button ${isFollowing ? 'button-secondary' : 'button-primary'}`}
        onClick={async () => {
          if (!session?.user?.id) {
            setMessage('Please sign in to follow users.');
            return;
          }

          setMessage('');
          const method = isFollowing ? 'DELETE' : 'POST';
          const response = await fetch('/api/follow', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followeeId: profileId }),
          });

          const data = await response.json();
          if (!response.ok) {
            setMessage(data?.error || 'Unable to update follow state.');
            return;
          }

          const nextState = !isFollowing;
          setIsFollowing(nextState);
          setMessage(nextState ? 'Followed successfully.' : 'Unfollowed successfully.');
        }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
