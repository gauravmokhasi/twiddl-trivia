import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyQuestionLimitResponse, hasAskedWithinWindow, isDailyQuestionLimitError } from './daily-question-rule';
import { isNavigationActive } from './navigation';

const now = Date.parse('2026-10-07T00:00:00Z');

test('the rolling window rejects just inside 24 hours but allows the exact boundary', () => {
  assert.equal(hasAskedWithinWindow('2026-10-06T00:00:00.001Z', now), true);
  assert.equal(hasAskedWithinWindow('2026-10-06T00:00:00.000Z', now), false);
  assert.equal(hasAskedWithinWindow('2026-10-05T23:59:59.999Z', now), false);
});

test('only the specific database daily-limit code maps to the friendly alreadyAsked result', () => {
  assert.equal(isDailyQuestionLimitError({ code: 'TWD01' }), true);
  for (const error of [null, undefined, {}, { code: '23505' }, { code: '42501' }]) {
    assert.equal(isDailyQuestionLimitError(error), false);
  }
  assert.deepEqual(dailyQuestionLimitResponse(), {
    error: 'You can only ask one question every 24 hours.', alreadyAsked: true,
  });
});

test('Explore is active only in its section and Feed only on the root route', () => {
  assert.equal(isNavigationActive('/explore', '/explore'), true);
  assert.equal(isNavigationActive('/explore/older', '/explore'), true);
  for (const path of ['/', '/universe', '/notifications', '/profile/maya', '/explorer']) {
    assert.equal(isNavigationActive(path, '/explore'), false);
  }
  assert.equal(isNavigationActive('/', '/'), true);
  assert.equal(isNavigationActive('/explore', '/'), false);
  assert.equal(isNavigationActive('/universe', '/universe'), true);
  assert.equal(isNavigationActive('/notifications', '/notifications'), true);
  assert.equal(isNavigationActive('/profile/maya', '/profile'), true);
});
