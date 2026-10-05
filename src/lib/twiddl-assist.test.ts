import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coerceAiAssistAccuracyConcern,
  coerceAiAssistReview,
  combineAiAssistResult,
  resolveIntendedAnswer,
} from './twiddl-assist';

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

test('Accuracy concern needs both a flag and an explanation', () => {
  assert.deepEqual(
    coerceAiAssistAccuracyConcern({
      shouldWarn: true,
      kind: 'ANSWER_LOOKS_WRONG',
      message: 'I might be wrong, but I think the answer is actually 1901.',
    }),
    {
      kind: 'ANSWER_LOOKS_WRONG',
      message: 'I might be wrong, but I think the answer is actually 1901.',
    },
  );

  assert.deepEqual(
    coerceAiAssistAccuracyConcern({ shouldWarn: true, kind: 'AMBIGUOUS', message: '  More than one   answer fits.  ' }),
    { kind: 'AMBIGUOUS', message: 'More than one answer fits.' },
  );
});

test('Accuracy stays silent whenever the reviewer is not confident', () => {
  // A question the reviewer believes is right, and one it does not trust its own knowledge on, both
  // come back with shouldWarn false. The message must be ignored even when the model writes one.
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: false, kind: 'AMBIGUOUS', message: 'maybe?' }), null);
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: false, kind: null, message: null }), null);
});

test('Accuracy stays silent when the verdict is incomplete', () => {
  assert.equal(coerceAiAssistAccuracyConcern({ kind: 'AMBIGUOUS', message: 'Missing the flag.' }), null);
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: true, kind: 'AMBIGUOUS' }), null);
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: true, kind: 'AMBIGUOUS', message: '   ' }), null);
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: true, kind: 'NOT_A_KIND', message: 'Nope.' }), null);
  assert.equal(coerceAiAssistAccuracyConcern({ shouldWarn: 'true', kind: 'AMBIGUOUS', message: 'Nope.' }), null);
  assert.equal(coerceAiAssistAccuracyConcern(null), null);
  assert.equal(coerceAiAssistAccuracyConcern('AMBIGUOUS'), null);
});

test('Accuracy messages are length capped', () => {
  const concern = coerceAiAssistAccuracyConcern({
    shouldWarn: true,
    kind: 'QUESTION_LOOKS_WRONG',
    message: 'x'.repeat(500),
  });

  assert.ok(concern);
  assert.equal(concern.message.length, 320);
});

test('A pending rewrite never hides an accuracy doubt', () => {
  // The rewrite is optional style advice; the accuracy concern is about the facts, so the two are
  // reported side by side rather than one silencing the other.
  const concern = { kind: 'AMBIGUOUS' as const, message: 'Two answers fit.' };

  const reframe = combineAiAssistResult(
    { assessment: 'NEEDS_REFRAME', suggestedQuestion: 'A better version?', shortReason: 'Rote recall.' },
    concern,
  );
  assert.deepEqual(reframe.accuracy, concern);
  assert.equal(reframe.suggestedQuestion, 'A better version?');

  const okay = combineAiAssistResult({ assessment: 'OKAY', suggestedQuestion: null, shortReason: null }, concern);
  assert.deepEqual(okay.accuracy, concern);

  const good = combineAiAssistResult({ assessment: 'GOOD', suggestedQuestion: null, shortReason: null }, null);
  assert.equal(good.accuracy, null);
  assert.equal(good.assessment, 'GOOD');
});

test('Every check judges the same intended answer', () => {
  // Multiple choice: the ticked option wins.
  assert.equal(
    resolveIntendedAnswer({ questionType: 'multiple_choice', choices: ['Paris', 'London'], correctAnswerIndex: 1 }).intendedAnswer,
    'London',
  );

  // An out-of-range index falls back to the typed answer rather than inventing one.
  assert.equal(
    resolveIntendedAnswer({ questionType: 'multiple_choice', choices: ['Paris'], correctAnswerIndex: 3, correctAnswer: 'Rome' }).intendedAnswer,
    'Rome',
  );

  // Free text: aliases are reduced to the primary answer, so "Paris, City of Light" is one answer.
  assert.equal(resolveIntendedAnswer({ questionType: 'free_text', correctAnswer: 'Paris, City of Light' }).intendedAnswer, 'Paris');

  assert.equal(resolveIntendedAnswer({ questionType: 'free_text', correctAnswer: '   ' }).intendedAnswer, '');
});
