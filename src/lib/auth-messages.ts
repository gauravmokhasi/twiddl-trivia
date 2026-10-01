/**
 * Friendly, user-facing copy for Supabase Auth failures. Ordinary users should never be shown raw
 * provider or SMTP errors, but the messages must still point at what they can actually do next.
 */

type AuthErrorLike = { message?: string; status?: number; code?: string } | null | undefined;

const RATE_LIMIT = /rate limit|too many requests|after \d+ seconds|for security purposes/i;
const DELIVERY_FAILURE = /error sending|smtp|failed to send|sending.*email|email.*not.*sent|mailer/i;
const INVALID_EMAIL = /invalid email|unable to validate email|email address.*invalid|invalid format/i;
const SIGNUP_DISABLED = /signups? not allowed|signups? (are )?(currently )?disabled|not allowed to sign ?up/i;
const PROVIDER_UNAVAILABLE = /provider is not enabled|unsupported provider|provider.*not.*enabled/i;
const NETWORK = /failed to fetch|network|fetch failed|load failed|timeout/i;

export const EMAIL_SENT_MESSAGE = 'Check your inbox for a sign-in link. If it has not arrived in a minute or two, check your spam folder, or try Continue with Google.';
export const AUTH_CALLBACK_FAILED_MESSAGE = 'We could not complete that sign-in. Please request a new link and try again.';
export const OAUTH_CALLBACK_FAILED_MESSAGE = 'Google sign-in was cancelled or could not be completed. Please try again.';

export function friendlyAuthMessage(error: AuthErrorLike): string {
  if (!error) return 'We could not reach the sign-in service. Check your connection and try again.';

  const text = `${error.message ?? ''} ${error.code ?? ''}`;

  if (error.status === 429 || RATE_LIMIT.test(text)) {
    return 'Too many sign-in emails have been requested. Please wait a few minutes before trying again.';
  }

  if (PROVIDER_UNAVAILABLE.test(text)) {
    return 'That sign-in option is not available right now. Please use the email option instead.';
  }

  if (SIGNUP_DISABLED.test(text)) {
    return 'New sign-ups are currently unavailable. Please try again later.';
  }

  if (INVALID_EMAIL.test(text)) {
    return 'That email address does not look right. Please check it and try again.';
  }

  if (DELIVERY_FAILURE.test(text)) {
    return 'We could not send the sign-in email just now. Please try again in a moment.';
  }

  if (NETWORK.test(text)) {
    return 'We could not reach the sign-in service. Check your connection and try again.';
  }

  return 'Something went wrong while signing you in. Please try again.';
}