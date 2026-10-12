import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deterministicEventUuid,
  getAnalyticsConfig,
  isAuthenticationLocation,
  nextIdentityAction,
  planServerEvent,
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsUrl,
  shouldDropAnalyticsEvent,
  type AnalyticsConfig,
} from './analytics';

const ENV_NAMES = {
  KEY: 'NEXT_PUBLIC_POSTHOG_KEY',
  HOST: 'NEXT_PUBLIC_POSTHOG_HOST',
  ENABLED: 'NEXT_PUBLIC_POSTHOG_ENABLED',
} as const;

function setEnv(name: string, value: string | undefined) {
  // Assigning undefined to process.env stores the string "undefined", so clear it instead.
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/** Runs `fn` with a specific analytics environment, then restores the previous one. */
function withEnv(values: { KEY?: string; HOST?: string; ENABLED?: string }, fn: () => void) {
  const original = Object.values(ENV_NAMES).map((name) => [name, process.env[name]] as const);
  setEnv(ENV_NAMES.KEY, values.KEY);
  setEnv(ENV_NAMES.HOST, values.HOST);
  setEnv(ENV_NAMES.ENABLED, values.ENABLED);
  try {
    fn();
  } finally {
    for (const [name, value] of original) setEnv(name, value);
  }
}

const ON: AnalyticsConfig = { enabled: true, key: 'phc_test', host: 'https://us.i.posthog.com' };

test('analytics stays off until token, host and opt-in are all present', () => {
  withEnv({ KEY: 'phc_test', HOST: 'https://us.i.posthog.com', ENABLED: 'true' }, () => {
    assert.equal(getAnalyticsConfig().enabled, true);
  });

  // Local development and preview deployments leave the opt-in unset.
  withEnv({ KEY: 'phc_test', HOST: 'https://us.i.posthog.com' }, () => {
    assert.equal(getAnalyticsConfig().enabled, false);
  });
  withEnv({ KEY: 'phc_test', HOST: 'https://us.i.posthog.com', ENABLED: 'false' }, () => {
    assert.equal(getAnalyticsConfig().enabled, false);
  });

  // An explicit opt-in with an incomplete setup still cannot capture.
  withEnv({ KEY: 'phc_test', ENABLED: 'true' }, () => {
    assert.equal(getAnalyticsConfig().enabled, false);
  });
  withEnv({ HOST: 'https://us.i.posthog.com', ENABLED: 'true' }, () => {
    assert.equal(getAnalyticsConfig().enabled, false);
  });
});

test('URLs lose query strings, fragments and profile handles', () => {
  assert.equal(sanitizeAnalyticsUrl('/questions/abc?code=sup3r-secret'), '/questions/abc');
  assert.equal(sanitizeAnalyticsUrl('/profile/raya#followers'), '/profile/:username');
  assert.equal(
    sanitizeAnalyticsUrl('https://twiddl.example/profile/raya?view=profile&email=a%40b.co'),
    'https://twiddl.example/profile/:username',
  );
  assert.equal(sanitizeAnalyticsUrl('https://twiddl.example/feed'), 'https://twiddl.example/feed');
  assert.equal(sanitizeAnalyticsUrl('/'), '/');
  // Not a location at all, so it is left exactly as it came in.
  assert.equal(sanitizeAnalyticsUrl('some ordinary text'), 'some ordinary text');
});

test('property sanitising only rewrites location-shaped values', () => {
  const sanitized = sanitizeAnalyticsProperties({
    $current_url: 'https://twiddl.example/profile/raya?code=abc',
    $referrer: 'https://google.com/search?q=me%40example.com',
    $pathname: '/profile/raya',
    profile_user_id: 'user-uuid-1',
    is_own_profile: true,
    count: 3,
    label: 'contains a ? but is not a location',
  });

  assert.equal(sanitized.$current_url, 'https://twiddl.example/profile/:username');
  assert.equal(sanitized.$referrer, 'https://google.com/search');
  assert.equal(sanitized.$pathname, '/profile/:username');
  assert.equal(sanitized.profile_user_id, 'user-uuid-1');
  assert.equal(sanitized.is_own_profile, true);
  assert.equal(sanitized.count, 3);
  assert.equal(sanitized.label, 'contains a ? but is not a location');
});

test('authentication callback pageviews are dropped, other pageviews are kept', () => {
  assert.equal(shouldDropAnalyticsEvent('$pageview', { $current_url: 'https://twiddl.example/auth/callback?code=abc' }), true);
  assert.equal(shouldDropAnalyticsEvent('$pageview', { $current_url: '/auth/callback' }), true);
  assert.equal(shouldDropAnalyticsEvent('$pageview', { $current_url: 'https://twiddl.example/feed' }), false);
  // A custom event on an auth URL is still a real product event.
  assert.equal(shouldDropAnalyticsEvent('profile_viewed', { $current_url: '/auth/callback' }), false);
  assert.equal(isAuthenticationLocation('/notifications'), false);
  assert.equal(isAuthenticationLocation(null), false);
});

test('identity only changes when the signed-in user actually changes', () => {
  // Still resolving: never touch identity, so a refresh cannot reset someone.
  assert.equal(nextIdentityAction({ isLoading: true, userId: 'u1', identifiedUserId: null }), 'none');
  assert.equal(nextIdentityAction({ isLoading: true, userId: null, identifiedUserId: 'u1' }), 'none');

  // First sign-in, then the same user again after a token refresh or re-render.
  assert.equal(nextIdentityAction({ isLoading: false, userId: 'u1', identifiedUserId: null }), 'identify');
  assert.equal(nextIdentityAction({ isLoading: false, userId: 'u1', identifiedUserId: 'u1' }), 'none');

  // A different account drops the previous person before claiming the new one.
  assert.equal(nextIdentityAction({ isLoading: false, userId: 'u2', identifiedUserId: 'u1' }), 'reset_then_identify');

  // Sign-out clears identity, but only if somebody was identified.
  assert.equal(nextIdentityAction({ isLoading: false, userId: null, identifiedUserId: 'u1' }), 'reset');
  assert.equal(nextIdentityAction({ isLoading: false, userId: null, identifiedUserId: null }), 'none');
});

const QUESTION_EVENT = {
  distinctId: 'user-uuid-1',
  event: 'question_asked',
  properties: { question_id: 'question-uuid-1', question_type: 'free_text' },
  persistedId: 'question-uuid-1',
};

test('no server event is planned while analytics is unavailable', () => {
  assert.equal(planServerEvent(QUESTION_EVENT, { ...ON, enabled: false }), null);
  assert.equal(planServerEvent(QUESTION_EVENT, { ...ON, key: null }), null);
  assert.equal(planServerEvent(QUESTION_EVENT, { ...ON, host: null }), null);
  // An event with no verified user id would belong to nobody, so it is dropped.
  assert.equal(planServerEvent({ ...QUESTION_EVENT, distinctId: '' }, ON), null);
  assert.equal(planServerEvent({ ...QUESTION_EVENT, event: '' }, ON), null);
});

test('question_asked carries only the persisted ids the route declares', () => {
  const planned = planServerEvent(QUESTION_EVENT, ON);
  assert.ok(planned);
  assert.equal(planned.distinctId, 'user-uuid-1');
  assert.equal(planned.event, 'question_asked');
  assert.deepEqual(planned.properties, {
    question_id: 'question-uuid-1',
    question_type: 'free_text',
    $insert_id: 'question_asked:question-uuid-1',
  });
});

test('answer_submitted keeps the persisted ids and the grade flag', () => {
  const planned = planServerEvent({
    distinctId: 'user-uuid-1',
    event: 'answer_submitted',
    properties: {
      answer_id: 'answer-uuid-1',
      question_id: 'question-uuid-1',
      question_type: 'multiple_choice',
      is_correct: false,
    },
    persistedId: 'answer-uuid-1',
  }, ON);

  assert.ok(planned);
  assert.deepEqual(planned.properties, {
    answer_id: 'answer-uuid-1',
    question_id: 'question-uuid-1',
    question_type: 'multiple_choice',
    is_correct: false,
    $insert_id: 'answer_submitted:answer-uuid-1',
  });
  // Nothing user-authored can ride along: no question text, answer text or handle.
  assert.equal(Object.keys(planned.properties).length, 5);
});

test('the same persisted row always produces the same event uuid', () => {
  const first = planServerEvent(QUESTION_EVENT, ON);
  const replay = planServerEvent(QUESTION_EVENT, ON);
  assert.ok(first && replay);
  assert.equal(first.uuid, replay.uuid);
  assert.match(
    first.uuid!,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  // A different row must not collide with it.
  const otherRow = planServerEvent({ ...QUESTION_EVENT, persistedId: 'question-uuid-2' }, ON);
  assert.ok(otherRow);
  assert.notEqual(first.uuid, otherRow.uuid);
  assert.equal(
    deterministicEventUuid('question_asked', 'question-uuid-1'),
    deterministicEventUuid('question_asked', 'question-uuid-1'),
  );
});
