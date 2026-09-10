'use client';

import { useState } from 'react';

type Props = {
  isPublic: boolean;
};

export default function ProfileVisibilityToggle({ isPublic }: Props) {
  const [publicState, setPublicState] = useState(isPublic);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const toggleVisibility = async () => {
    setIsSaving(true);
    setMessage('');

    const response = await fetch('/api/profile-visibility', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: !publicState }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data?.error || 'Unable to update profile visibility.');
      setIsSaving(false);
      return;
    }

    setPublicState(!publicState);
    setMessage(publicState ? 'Profile is now private.' : 'Profile is now public and visible in the universe.');
    setIsSaving(false);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={`button ${publicState ? 'button-primary' : 'button-secondary'}`}
        onClick={toggleVisibility}
        disabled={isSaving}
      >
        {publicState ? 'Make Private' : 'Make Public'}
      </button>
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
