'use client';

import { useEffect, useState } from 'react';
import {
  FACT_CHECK_STORAGE_KEY,
  getStoredFactCheckPreference,
} from '@/lib/twiddl-assist-preferences';

/**
 * Owner-only accuracy-check switch for the profile page. This is the way back
 * on: turning the check off from an accuracy card can only be undone here.
 */
export default function AccuracyCheckToggle() {
  // localStorage is client-only, so lazy-init from storage: the initializer
  // runs only on the client, keeping SSR on the default instead of
  // mismatching a stored "off".
  const [enabled, setEnabled] = useState<boolean>(() => getStoredFactCheckPreference());

  useEffect(() => {
    try {
      window.localStorage.setItem(FACT_CHECK_STORAGE_KEY, String(enabled));
    } catch {
      // Preference simply does not persist (e.g. private browsing).
    }
  }, [enabled]);

  return (
    <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div>
        <p className="text-sm font-medium text-zinc-200">Accuracy check</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {enabled
            ? 'On. Twiddl Assist quietly double-checks your drafts before posting and only speaks up when it is confident something looks wrong.'
            : 'Off. Your drafts post without the accuracy spot-check. Turn it back on anytime here.'}
        </p>
      </div>
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={`Accuracy check: ${enabled ? 'on' : 'off'}`}
        onClick={() => setEnabled((value) => !value)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${enabled ? 'border-violet-400/60 bg-violet-500/80' : 'border-white/15 bg-zinc-700'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white transition ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
