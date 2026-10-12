/**
 * Shared PostHog rules: whether analytics may run, what a URL is allowed to
 * contain, and when identity should change. Everything here is pure and
 * dependency-free so the browser, the API routes and the tests all apply
 * exactly the same rules.
 *
 * Analytics fails closed throughout. A missing token, a missing host or a
 * missing opt-in each mean "do not capture", which keeps local development,
 * `npm test` and Vercel preview deployments out of the production dataset
 * unless they are deliberately pointed at a separate test project.
 */

export type AnalyticsProperties = Record<string, any>;

export type AnalyticsConfig = {
  enabled: boolean;
  /** PostHog project ingestion token. Safe to ship to the browser; never a personal API key. */
  key: string | null;
  /** Regional ingestion host, e.g. https://us.i.posthog.com or https://eu.i.posthog.com. */
  host: string | null;
};

/**
 * Reads the analytics environment.
 *
 * `NEXT_PUBLIC_POSTHOG_ENABLED` is the switch that separates environments:
 * production sets it to `true`, everything else leaves it unset (or sets it to
 * `false`). Reading it as a literal `process.env.NEXT_PUBLIC_*` access is what
 * lets Next.js inline the value into the client bundle at build time, so the
 * browser and the server always agree on whether capture is allowed.
 */
export function getAnalyticsConfig(): AnalyticsConfig {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || null;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || null;
  const explicitlyEnabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true';

  return {
    enabled: explicitlyEnabled && Boolean(key) && Boolean(host),
    key,
    host,
  };
}

export function isAnalyticsEnabled(): boolean {
  return getAnalyticsConfig().enabled;
}

/** Only absolute URLs and root-relative paths are treated as navigable locations. */
function looksLikeLocation(value: string): boolean {
  return value.startsWith('/') || /^https?:\/\//i.test(value);
}

function safePathname(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    // Not absolute after all: fall back to treating it as a path.
    return value;
  }
}

/**
 * Strips everything that could carry a secret or personal detail, then replaces
 * a profile handle with a fixed token.
 *
 * Query strings and fragments are dropped wholesale rather than filtered: auth
 * codes, tokens and email addresses all travel in them, and no query parameter
 * is needed for product analytics here. Handles are user-chosen, so
 * `/profile/raya` becomes `/profile/:username`; the explicit `profile_user_id`
 * property on `profile_viewed` is the identifier PostHog should use instead.
 */
export function sanitizeAnalyticsUrl(raw: string): string {
  if (!looksLikeLocation(raw)) return raw;

  let origin = '';
  let pathname: string;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      origin = parsed.origin;
      pathname = parsed.pathname;
    } catch {
      return raw.split('#')[0].split('?')[0];
    }
  } else {
    pathname = raw.split('#')[0].split('?')[0];
  }

  return origin + pathname.replace(/\/profile\/[^/?#]+/, '/profile/:username');
}

/**
 * Sanitises every location-shaped value in an automatically collected property
 * bag. This covers `$current_url`, `$pathname`, `$referrer` and the `$initial_*`
 * copies PostHog adds to the person, without needing a per-key allow-list that
 * would silently rot as the SDK adds new URL properties.
 *
 * Disabling autocapture does not make URLs safe on its own - pageviews still
 * carry them - so every captured event goes through this.
 */
export function sanitizeAnalyticsProperties(properties: AnalyticsProperties): AnalyticsProperties {
  const source = properties ?? {};
  const sanitized: AnalyticsProperties = {};

  for (const [key, value] of Object.entries(source)) {
    sanitized[key] = typeof value === 'string' && looksLikeLocation(value)
      ? sanitizeAnalyticsUrl(value)
      : value;
  }

  return sanitized;
}

/** `/auth/callback` and anything beneath `/auth/` - where codes land. */
export function isAuthenticationLocation(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false;
  const path = /^https?:\/\//i.test(url) ? safePathname(url) : url.split('#')[0].split('?')[0];
  return path === '/auth' || path.startsWith('/auth/');
}

/**
 * Authentication callback pages are plumbing, not product traffic, so their
 * pageviews are dropped rather than sanitised. Pageviews everywhere else stay
 * on, which is the single pageview mechanism this integration uses.
 */
export function shouldDropAnalyticsEvent(event: string, properties: AnalyticsProperties): boolean {
  if (event !== '$pageview') return false;
  return isAuthenticationLocation(properties?.$current_url);
}

export type IdentityAction = 'none' | 'identify' | 'reset' | 'reset_then_identify';

/**
 * Turns one auth state into the identity work it implies.
 *
 * - `isLoading` short-circuits everything: a page refresh must never reset
 *   someone whose session is merely still resolving.
 * - A steady session re-render (or a token refresh) maps to `none`, so identify
 *   is not repeated on every render.
 * - A different signed-in user resets first, so the previous person never
 *   inherits the new one's activity.
 * - A settled signed-out state resets only if someone was identified earlier.
 */
export function nextIdentityAction(input: {
  isLoading: boolean;
  userId: string | null;
  identifiedUserId: string | null;
}): IdentityAction {
  if (input.isLoading) return 'none';

  if (input.userId) {
    if (input.userId === input.identifiedUserId) return 'none';
    return input.identifiedUserId ? 'reset_then_identify' : 'identify';
  }

  return input.identifiedUserId ? 'reset' : 'none';
}

/** Deterministic key for a persisted row, useful for grouping and debugging. */
export function analyticsInsertId(event: string, persistedId: string): string {
  return `${event}:${persistedId}`;
}

/**
 * A stable 16-byte digest of the input, formatted as an RFC 4122 version 4 UUID.
 *
 * PostHog's `uuid` capture option is the SDK's documented idempotency hook:
 * emitting the same deterministic UUID twice lets storage recognise the same
 * business event. PostHog does not promise strict exactly-once delivery, so
 * this is best-effort duplicate suppression rather than a guarantee.
 */
function digestBytes(input: string): number[] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < input.length; i += 1) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [
    h1 & 0xff, (h1 >>> 8) & 0xff, (h1 >>> 16) & 0xff, (h1 >>> 24) & 0xff,
    h2 & 0xff, (h2 >>> 8) & 0xff, (h2 >>> 16) & 0xff, (h2 >>> 24) & 0xff,
    h3 & 0xff, (h3 >>> 8) & 0xff, (h3 >>> 16) & 0xff, (h3 >>> 24) & 0xff,
    h4 & 0xff, (h4 >>> 8) & 0xff, (h4 >>> 16) & 0xff, (h4 >>> 24) & 0xff,
  ];
}

export function deterministicEventUuid(event: string, persistedId: string): string {
  const bytes = digestBytes(analyticsInsertId(event, persistedId));
  // Force the version 4 / variant 10 bits so the value is a valid UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type PlannedServerEvent = {
  distinctId: string;
  event: string;
  properties: AnalyticsProperties;
  uuid?: string;
};

/**
 * Decides what, if anything, to send for one server-side event.
 *
 * Returns `null` whenever analytics is off or the event is incomplete, which is
 * what makes a missing token, a missing host, a missing opt-in or an absent
 * user ID all equivalent to "stay quiet" - no configuration problem can turn
 * into a thrown error inside an API route.
 *
 * When a persisted row ID is supplied the event also gets a deterministic UUID,
 * so the same row cannot produce two visually distinct events.
 */
export function planServerEvent(
  input: {
    distinctId: string;
    event: string;
    properties?: AnalyticsProperties;
    persistedId?: string;
  },
  config: AnalyticsConfig = getAnalyticsConfig(),
): PlannedServerEvent | null {
  if (!config.enabled || !config.key || !config.host) return null;
  if (!input.distinctId || !input.event) return null;

  const properties: AnalyticsProperties = { ...input.properties };

  if (input.persistedId) {
    properties.$insert_id = analyticsInsertId(input.event, input.persistedId);
  }

  return {
    distinctId: input.distinctId,
    event: input.event,
    properties,
    ...(input.persistedId
      ? { uuid: deterministicEventUuid(input.event, input.persistedId) }
      : {}),
  };
}
