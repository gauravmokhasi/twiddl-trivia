import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { createFollowAction, saveFollowState, type FollowState } from './follow-action';
import { isDailyQuestionRouteLocked, isNavigationLocked } from './daily-question-access';

before(() => {
  // Public placeholders only; SSR tests never contact Supabase.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-public-anon-key';
});

test('follow reacts immediately and rejects repeated clicks while saving', async () => {
  const states: FollowState[] = [];
  let resolve!: () => void;
  let calls = 0;
  const save = new Promise<void>((done) => { resolve = done; });
  const toggle = createFollowAction(false, (state) => states.push(state), async (following) => {
    calls++;
    assert.equal(following, true);
    await save;
  });
  const first = toggle();
  assert.equal(states[0].isFollowing, true);
  assert.equal(states[0].pending, true);
  await toggle();
  assert.equal(calls, 1);
  resolve();
  await first;
  assert.equal(states.at(-1)?.pending, false);
  assert.equal(states.at(-1)?.message, 'Followed successfully.');
});

test('failed unfollow restores Following and permits a retry', async () => {
  const states: FollowState[] = [];
  let calls = 0;
  const toggle = createFollowAction(true, (state) => states.push(state), async () => {
    if (++calls === 1) throw new Error('Authentication required.');
  });
  await toggle();
  assert.equal(states[0].isFollowing, false);
  assert.equal(states.at(-1)?.isFollowing, true);
  assert.equal(states.at(-1)?.pending, false);
  assert.equal(states.at(-1)?.message, 'Authentication required.');
  await toggle();
  assert.equal(calls, 2);
  assert.equal(states.at(-1)?.isFollowing, false);
});

test('follow request uses POST/DELETE and reports HTTP and connection failures', async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/follow');
    assert.deepEqual(JSON.parse(init?.body as string), { followeeId: 'target' });
    methods.push(init?.method ?? '');
    return new Response(null, { status: 200 });
  };
  try {
    await saveFollowState('target', true);
    await saveFollowState('target', false);
    assert.deepEqual(methods, ['POST', 'DELETE']);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });
    await assert.rejects(saveFollowState('target', true), /Authentication required/);
    globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 503 });
    await assert.rejects(saveFollowState('target', true), /Unable to update/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(saveFollowState('target', true), /Could not connect/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('daily gate exempts only the verified owner and keeps social routes locked', () => {
  assert.equal(isDailyQuestionRouteLocked(true, 'viewer', 'viewer'), false);
  assert.equal(isDailyQuestionRouteLocked(true, 'viewer', 'other'), true);
  assert.equal(isDailyQuestionRouteLocked(true, 'viewer'), true);
  assert.equal(isDailyQuestionRouteLocked(true, null, 'viewer'), true);
  assert.equal(isDailyQuestionRouteLocked(false, null, 'other'), false);
  for (const href of ['/universe', '/explore', '/notifications']) {
    assert.equal(isNavigationLocked(true, href), true);
    assert.equal(isNavigationLocked(false, href), false);
  }
  for (const href of ['/', '/profile']) assert.equal(isNavigationLocked(true, href), false);
});

test('follow status is rendered from server props before hydration', async () => {
  const { default: ProfileButton } = await import('../components/profile-button');
  const following = renderToStaticMarkup(<ProfileButton profileId="other" viewerId="viewer" initialIsFollowing={true} />);
  assert.match(following, /aria-pressed="true"/);
  assert.match(following, />Following<\/button>/);
  assert.doesNotMatch(following, /Loading follow status/);
  assert.equal(renderToStaticMarkup(<ProfileButton profileId="viewer" viewerId="viewer" initialIsFollowing={false} />), '');
  const anonymous = renderToStaticMarkup(<ProfileButton profileId="other" viewerId={null} initialIsFollowing={false} />);
  assert.match(anonymous, /Sign in to follow/);
});

test('landing HTML contains the marketing copy and magic-link form while auth loads', async () => {
  const { default: LoggedOutLanding } = await import('../components/LoggedOutLanding');
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={{ refresh() {} } as never}>
      <LoggedOutLanding />
    </AppRouterContext.Provider>,
  );
  assert.match(html, /Ask one\./);
  assert.match(html, /type="email"/);
  assert.doesNotMatch(html, /Loading your Twiddl/);
});

test('locked navigation exposes account access and associates the visible explanation', async () => {
  const { default: NavLinks } = await import('../components/NavLinks');
  const html = renderToStaticMarkup(
    <PathnameContext.Provider value="/profile/viewer">
      <NavLinks locked={true} initialViewerId="viewer" />
    </PathnameContext.Provider>,
  );
  assert.match(html, /href="\/profile"/);
  assert.match(html, /aria-current="page"[^>]*>Profile/);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /href="\/explore"/);
  assert.match(html, /aria-describedby="daily-question-lock-help"/);
});

test('Explore keeps the same inactive tab treatment as other destinations', async () => {
  const { default: NavLinks } = await import('../components/NavLinks');
  const html = renderToStaticMarkup(
    <PathnameContext.Provider value="/universe">
      <NavLinks locked={false} initialViewerId="viewer" />
    </PathnameContext.Provider>,
  );
  const universe = html.match(/<a[^>]*href="\/universe"[^>]*>/)?.[0];
  assert.ok(universe);
  assert.match(universe, /aria-current="page"/);
  const explore = html.match(/<a[^>]*href="\/explore"[^>]*>/)?.[0];
  assert.ok(explore);
  assert.doesNotMatch(explore, /aria-current|bg-violet-500\/20/);
});
