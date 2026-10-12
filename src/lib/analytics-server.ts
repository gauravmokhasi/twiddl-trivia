import 'server-only';
import { PostHog } from 'posthog-node';
import { getAnalyticsConfig, planServerEvent, type PlannedServerEvent } from './analytics';

/**
 * Longest a request will ever wait on analytics. `captureImmediate` is
 * posthog-node's serverless path - it resolves once the ingestion request has
 * finished - so this bound is what keeps a slow PostHog from stalling an API
 * response. Work still in flight after the bound is abandoned rather than
 * awaited, so the wait can never become unbounded.
 */
const DELIVERY_TIMEOUT_MS = 1000;

export type ServerAnalyticsEvent = Parameters<typeof planServerEvent>[0];

/** What finally gets handed to PostHog. */
export type DeliverableEvent = PlannedServerEvent;

export type AnalyticsTransport = (event: DeliverableEvent) => void | Promise<void>;

let client: PostHog | null = null;

function createTransport(key: string, host: string): AnalyticsTransport {
  if (!client) {
    client = new PostHog(key, {
      host,
      // Vercel functions are short-lived, so send as soon as an event exists
      // instead of waiting on a batch timer that may never fire.
      flushAt: 1,
      flushInterval: 0,
    });
  }

  const posthog = client;
  return async (event) => {
    await posthog.captureImmediate({
      distinctId: event.distinctId,
      event: event.event,
      properties: event.properties,
      ...(event.uuid ? { uuid: event.uuid } : {}),
    });
  };
}

/**
 * Resolves when `work` settles or `ms` elapses, whichever comes first. Late
 * rejections are swallowed so an abandoned delivery can never surface as an
 * unhandled promise rejection in the function runtime.
 */
function withTimeout(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const settle = () => resolve();
    const timer = setTimeout(settle, ms);
    work.then(settle, settle).finally(() => clearTimeout(timer));
  });
}

/**
 * Emits one server-side analytics event. Best effort by design:
 *
 * - Returns immediately and silently when analytics is disabled or the event is
 *   incomplete, so missing configuration can never break a request.
 * - Never rejects. Every failure is reduced to a log line, independently of
 *   whatever the API route is doing with its own error.
 * - Is bounded by {@link DELIVERY_TIMEOUT_MS}, so it cannot stall a response.
 *
 * Call this only AFTER the write it describes has succeeded.
 */
export async function captureServerEvent(
  input: ServerAnalyticsEvent,
  transport?: AnalyticsTransport,
): Promise<void> {
  try {
    const config = getAnalyticsConfig();
    const planned = planServerEvent(input, config);
    if (!planned || !config.key || !config.host) return;

    const activeTransport = transport ?? createTransport(config.key, config.host);
    await withTimeout(Promise.resolve(activeTransport(planned)), DELIVERY_TIMEOUT_MS);
  } catch (error) {
    console.warn(
      `[analytics] ${input.event} was not delivered: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
