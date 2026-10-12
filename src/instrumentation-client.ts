import posthog from 'posthog-js';
import {
  getAnalyticsConfig,
  sanitizeAnalyticsProperties,
  shouldDropAnalyticsEvent,
} from './lib/analytics';

/**
 * Runs before hydration, so PostHog is ready by the time the first React effect
 * fires. Everything is guarded: analytics must never stop Twiddl from loading,
 * and with no configuration this whole block is skipped.
 */
try {
  const { enabled, key, host } = getAnalyticsConfig();

  if (enabled && key && host && typeof window !== 'undefined') {
    posthog.init(key, {
      api_host: host,

      // The single pageview mechanism. `'history_change'` covers the initial
      // load AND App Router client navigations, so one mechanism handles both.
      // `onRouterTransitionStart` is deliberately left unused: wiring it up as
      // well would send every navigation twice.
      capture_pageview: 'history_change',
      capture_pageleave: true,

      // Out of scope for this integration: no click/form capture, no session
      // recording, no error tracking. Twiddl adds no flags, experiments or
      // surveys, so none of those are used either.
      autocapture: false,
      disable_session_recording: true,
      capture_exceptions: false,

      /**
       * Last chance to inspect anything the SDK builds automatically.
       *
       * Turning autocapture off does NOT make URLs safe - pageviews still
       * carry `$current_url` and `$referrer` - so every event is sanitised
       * here: query strings and fragments are dropped (auth codes, tokens and
       * email addresses travel in them) and profile handles are normalised.
       * Authentication callback pageviews are removed outright.
       */
      before_send: (capture) => {
        if (!capture) return capture;
        if (shouldDropAnalyticsEvent(capture.event, capture.properties)) return null;

        return {
          ...capture,
          properties: sanitizeAnalyticsProperties(capture.properties),
          ...(capture.$set ? { $set: sanitizeAnalyticsProperties(capture.$set) } : {}),
          ...(capture.$set_once ? { $set_once: sanitizeAnalyticsProperties(capture.$set_once) } : {}),
        };
      },
    });
  }
} catch {
  // Analytics is optional; a failure here must never block the app from booting.
}
