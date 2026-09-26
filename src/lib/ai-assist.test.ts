import test from 'node:test';
import assert from 'node:assert/strict';

import { coerceAiAssistReview } from './ai-assist';

test('GOOD questions strip all suggestion payloads', () => {
  const result = coerceAiAssistReview({
    assessment: 'GOOD',
    suggestedQuestion: 'This should be ignored',
    shortReason: 'Also ignored',
  });

  assert.deepEqual(result, {
    assessment: 'GOOD',
    suggestedQuestion: null,
    shortReason: null,
  });
});

test('OKAY questions also return no suggestion', () => {
  const result = coerceAiAssistReview({
    assessment: 'OKAY',
    suggestedQuestion: 'Not allowed',
    shortReason: 'Not allowed',
  });

  assert.deepEqual(result, {
    assessment: 'OKAY',
    suggestedQuestion: null,
    shortReason: null,
  });
});

test('NEEDS_REFRAME keeps the suggested rewrite', () => {
  const result = coerceAiAssistReview({
    assessment: 'NEEDS_REFRAME',
    suggestedQuestion: 'Who was the first person to walk on the moon?',
    shortReason: 'The original relied on direct recall and had no way in.',
  });

  assert.deepEqual(result, {
    assessment: 'NEEDS_REFRAME',
    suggestedQuestion: 'Who was the first person to walk on the moon?',
    shortReason: 'The original relied on direct recall and had no way in.',
  });
});

test('Malformed assessment payloads are rejected', () => {
  assert.equal(coerceAiAssistReview({ assessment: 'meh' }), null);
  assert.equal(coerceAiAssistReview({}), null);
});
