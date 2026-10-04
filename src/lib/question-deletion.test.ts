import test from 'node:test';
import assert from 'node:assert/strict';

import { QUESTION_DELETION_MIN_AGE_MS, canDeleteQuestion } from './question-deletion';

const ASKED = '2026-05-20T12:00:00.000Z';
const AUTHOR = 'author-id';
const NOW = new Date('2026-05-25T12:00:00.000Z').getTime();

test('the author can delete their own older question', () => {
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt: ASKED, now: NOW });

  assert.deepEqual(result, { allowed: true });
});

test('a question exactly one day old can be deleted', () => {
  const createdAt = new Date(NOW - QUESTION_DELETION_MIN_AGE_MS).toISOString();
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt, now: NOW });

  assert.deepEqual(result, { allowed: true });
});

test("today's question cannot be deleted, so the daily rule cannot be dodged", () => {
  const createdAt = new Date(NOW - 60 * 60 * 1000).toISOString();
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt, now: NOW });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 400);
});

test('a question one millisecond too young is refused', () => {
  const createdAt = new Date(NOW - QUESTION_DELETION_MIN_AGE_MS + 1).toISOString();
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt, now: NOW });

  assert.equal(result.allowed, false);
});

test('someone else cannot delete the question', () => {
  const result = canDeleteQuestion({ viewerId: 'someone', authorId: AUTHOR, createdAt: ASKED, now: NOW });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.status, 403);
    assert.match(result.error, /only delete questions you asked/i);
  }
});

test('a signed-out visitor cannot delete the question', () => {
  const result = canDeleteQuestion({ viewerId: null, authorId: AUTHOR, createdAt: ASKED, now: NOW });

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.status, 401);
});

test('the ownership check wins over the age check', () => {
  const young = new Date(NOW - 1000).toISOString();
  const result = canDeleteQuestion({ viewerId: 'someone', authorId: AUTHOR, createdAt: young, now: NOW });

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.status, 403);
});

test('an unreadable timestamp is refused rather than deleted', () => {
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt: 'not-a-date', now: NOW });

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.equal(result.status, 400);
});

test('the refusal copy for a young question mentions the wait', () => {
  const createdAt = new Date(NOW).toISOString();
  const result = canDeleteQuestion({ viewerId: AUTHOR, authorId: AUTHOR, createdAt, now: NOW });

  assert.equal(result.allowed, false);
  if (!result.allowed) assert.match(result.error, /a day old/);
});