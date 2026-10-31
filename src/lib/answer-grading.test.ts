import test from 'node:test';
import assert from 'node:assert/strict';
import { answeredResult, correctAnswerText, gradeAnswer, validateAnswer } from './answer-grading';
import { toPlayableQuestion, PLAYABLE_QUESTION_COLUMNS } from './playable-question';

const multipleChoice = { question_type: 'multiple_choice' as const, choices: ['London', 'Paris', 'Rome'] };
const mcKey = { question_id: 'question', correct_answer_index: 1, correct_answer: null };
const freeText = { question_type: 'free_text' as const, choices: [] };
const freeKey = { question_id: 'question', correct_answer_index: null, correct_answer: 'Charles Darwin, Darwin' };

test('runtime playable allowlist strips secrets even from a wider source object', () => {
  const source = {
    id: 'question', author_id: 'author', text: 'Capital of France?', ...multipleChoice,
    is_public: true, created_at: '2026-10-07T00:00:00Z', image_url: null,
    correct_answer: 'Paris', correct_answer_index: 1, question_secrets: mcKey,
  };
  const playable = toPlayableQuestion(source);
  assert.deepEqual(Object.keys(playable).sort(), PLAYABLE_QUESTION_COLUMNS.split(', ').sort());
  assert.equal(JSON.stringify(playable).includes('correct_answer'), false);
  assert.equal('question_secrets' in playable, false);
});

test('multiple-choice grading and persisted result use the server key', () => {
  assert.equal(gradeAnswer(multipleChoice, mcKey, 0, null).is_correct, false);
  const answer = gradeAnswer(multipleChoice, mcKey, 1, null);
  assert.equal(answer.is_correct, true);
  assert.deepEqual(answeredResult(multipleChoice, mcKey, answer), {
    hasAnswered: true, selectedChoiceIndex: 1, answerText: null, isCorrect: true, correctText: 'Paris',
  });
});

test('free-text aliases and reloaded wrong answers retain server-produced correct text', () => {
  assert.equal(gradeAnswer(freeText, freeKey, null, '  Darwin  ').is_correct, true);
  const wrong = gradeAnswer(freeText, freeKey, null, 'Newton');
  assert.equal(wrong.is_correct, false);
  assert.deepEqual(answeredResult(freeText, freeKey, wrong), {
    hasAnswered: true, selectedChoiceIndex: null, answerText: 'Newton', isCorrect: false, correctText: 'Charles Darwin, Darwin',
  });
});

test('reject fractional, nonnumeric, negative and out-of-range choices', () => {
  for (const value of [-1, 3, 1.5, '1', null, NaN, Infinity]) {
    assert.ok(validateAnswer(multipleChoice, value, null));
    assert.throws(() => gradeAnswer(multipleChoice, mcKey, value, null));
  }
});

test('reject empty, oversized and nonstring free-text submissions', () => {
  for (const value of ['', '   ', 'x'.repeat(201), null, 1]) assert.ok(validateAnswer(freeText, null, value));
});

test('missing or mismatched keys fail closed instead of guessing the correct answer', () => {
  assert.throws(() => correctAnswerText(multipleChoice, { ...mcKey, correct_answer_index: 9 }));
  assert.throws(() => correctAnswerText(freeText, { ...freeKey, correct_answer: null }));
  assert.throws(() => correctAnswerText(multipleChoice, freeKey));
  assert.throws(() => correctAnswerText(freeText, mcKey));
});
