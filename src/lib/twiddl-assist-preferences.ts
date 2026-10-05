/**
 * Shared Twiddl Assist preference keys so the composer and the profile page
 * read and write the same localStorage values.
 *
 * Coaching keeps its historical key so existing preferences carry over.
 * The accuracy check defaults on everywhere; it is only ever switched off
 * explicitly (from an accuracy card or the profile toggle).
 */

export const COACHING_STORAGE_KEY = 'twiddl-ai-assist-enabled';
export const FACT_CHECK_STORAGE_KEY = 'twiddl-assist-fact-check-enabled';

function readFlag(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;

  try {
    const storedValue = window.localStorage.getItem(key);
    if (storedValue === null) return fallback;
    return storedValue === 'true';
  } catch {
    return fallback;
  }
}

export function getStoredCoachingPreference() {
  return readFlag(COACHING_STORAGE_KEY, true);
}

export function getStoredFactCheckPreference() {
  return readFlag(FACT_CHECK_STORAGE_KEY, true);
}

export function setStoredFactCheckPreference(enabled: boolean) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(FACT_CHECK_STORAGE_KEY, String(enabled));
  } catch {
    // Private browsing etc: the preference simply does not persist.
  }
}
