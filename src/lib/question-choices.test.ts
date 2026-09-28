import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChoicePayload } from './question-choices';

test('a blank row before the ticked option does not shift the answer', () => {
  // This is the case that used to store a different choice as correct.
  assert.deepEqual(buildChoicePayload(['', 'London', 'Paris', 'Rome'], 1), {
    choices: ['London', 'Paris', 'Rome'],
    correctAnswerIndex: 0,
  });
});

test('the selected option keeps its identity when blank rows precede it', () => {
  assert.deepEqual(buildChoicePayload(['', 'London', 'Paris', 'Rome'], 2), {
    choices: ['London', 'Paris', 'Rome'],
    correctAnswerIndex: 1,
  });
});

test('whitespace-only rows behave like blank ones', () => {
  assert.deepEqual(buildChoicePayload(['London', '   ', 'Rome'], 2), {
    choices: ['London', 'Rome'],
    correctAnswerIndex: 1,
  });
});

test('a blank ticked row reports no correct answer', () => {
  assert.deepEqual(buildChoicePayload(['London', '', 'Rome'], 1), {
    choices: ['London', 'Rome'],
    correctAnswerIndex: -1,
  });
});

test('duplicate option text does not confuse the remap', () => {
  assert.deepEqual(buildChoicePayload(['Paris', '', 'Paris'], 2), {
    choices: ['Paris', 'Paris'],
    correctAnswerIndex: 1,
  });
});

test('blank rows are dropped from fully filled choices without moving the index', () => {
  assert.deepEqual(buildChoicePayload(['A', 'B', 'C'], 2), {
    choices: ['A', 'B', 'C'],
    correctAnswerIndex: 2,
  });
});