import Groq from 'groq-sdk';

/**
 * One shared Groq client for the whole app. Server-only: this module reads GROQ_API_KEY from the
 * server environment and must never be imported from a client component. The key is never
 * prefixed with NEXT_PUBLIC_ and is never returned to callers.
 */

export const GROQ_MODEL = 'openai/gpt-oss-20b';

let client: Groq | null = null;

/**
 * Returns the shared client, or null when GROQ_API_KEY is not configured so callers can fall
 * back to their non-Groq behaviour instead of throwing.
 */
export function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  if (!client) {
    client = new Groq({ apiKey });
  }

  return client;
}

export type GroqFailureKind = 'not_configured' | 'rate_limit' | 'auth' | 'connection' | 'api' | 'unknown';

export type GroqFailure = {
  kind: GroqFailureKind;
  message: string;
  status?: number;
  /** True when trying again could plausibly succeed: throttling, a dropped connection, or a 5xx. */
  retryable: boolean;
};

function statusOf(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/** Short, secret-free description of a Groq failure, suitable for logging. */
export function describeGroqFailure(error: unknown): GroqFailure {
  const status = statusOf(error);

  let kind: GroqFailureKind = 'unknown';
  if (error instanceof Groq.RateLimitError || status === 429) kind = 'rate_limit';
  else if (error instanceof Groq.AuthenticationError || status === 401 || status === 403) kind = 'auth';
  else if (error instanceof Groq.APIConnectionError || error instanceof Groq.APIConnectionTimeoutError) kind = 'connection';
  else if (error instanceof Groq.APIError) kind = 'api';

  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = redactSecrets(rawMessage).slice(0, 200);

  // Groq sometimes rejects its own structured output as json_validate_failed, which a retry can
  // clear. Auth mistakes and malformed requests are not worth repeating.
  const retryable = kind === 'rate_limit'
    || kind === 'connection'
    || (status !== undefined && status >= 500)
    || /json_validate_failed|failed to validate json/i.test(message);

  return { kind, message, status, retryable };
}

/** Belt and braces: strip anything key-shaped before it can reach a log line. */
export function redactSecrets(value: string) {
  return value
    .replace(/gsk_[A-Za-z0-9_-]+/g, 'gsk_[redacted]')
    .replace(/(api[_-]?key["'\s:=]+)[A-Za-z0-9_-]{8,}/gi, '$1[redacted]');
}
