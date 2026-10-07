import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeAnswerCount,
  describeFollowCount,
  describeReportCount,
  groupAnswersByQuestionAndDay,
  groupFollowsByDay,
  groupReportsByQuestionAndDay,
  mergeDigestDays,
  utcDayKey,
} from './notifications';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function at(hour: number, minute = 0, dayOffset = 0) {
  const base = new Date(Date.UTC(2026, 9, 7 - dayOffset, hour, minute));
  return base.toISOString();
}

test('utcDayKey buckets by UTC calendar day', () => {
  assert.equal(utcDayKey('2026-10-07T23:59:59.000Z'), '2026-10-07');
  assert.equal(utcDayKey('2026-10-08T00:00:01.000Z'), '2026-10-08');
});

test('zero activity yields an empty digest', () => {
  assert.deepEqual(mergeDigestDays([
    groupAnswersByQuestionAndDay([], NOW),
    groupReportsByQuestionAndDay([], NOW),
    groupFollowsByDay([], NOW),
  ], NOW), []);
});

test('one answer yields a singular notification', () => {
  const days = groupAnswersByQuestionAndDay([
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'maya', created_at: at(10) },
  ], NOW);

  assert.equal(days.length, 1);
  assert.equal(days[0].label, 'TODAY');
  assert.equal(days[0].items.length, 1);
  const item = days[0].items[0];
  assert.equal(item.kind, 'answers');
  if (item.kind === 'answers') {
    assert.equal(item.count, 1);
    assert.equal(describeAnswerCount(item.count), '1 person answered your question');
  }
});

test('three answers on one question yield ONE aggregate notification', () => {
  const days = groupAnswersByQuestionAndDay([
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'a', created_at: at(9) },
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'b', created_at: at(10) },
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'c', created_at: at(11) },
  ], NOW);

  assert.equal(days.length, 1);
  assert.equal(days[0].items.length, 1);
  const item = days[0].items[0];
  assert.equal(item.kind, 'answers');
  if (item.kind === 'answers') {
    assert.equal(item.count, 3);
    assert.equal(describeAnswerCount(item.count), '3 people answered your question');
    assert.equal(item.latestAt, at(11));
  }
});

test('answers on two questions yield separate notifications', () => {
  const days = groupAnswersByQuestionAndDay([
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'a', created_at: at(9) },
    { question_id: 'q-b', question_text: 'Question B?', responder_username: 'b', created_at: at(10) },
  ], NOW);

  assert.equal(days.length, 1);
  assert.equal(days[0].items.length, 2);
});

test('three follows yield ONE follower notification; one names the follower', () => {
  const days = groupFollowsByDay([
    { follower_username: 'a', created_at: at(9) },
    { follower_username: 'b', created_at: at(10) },
    { follower_username: 'c', created_at: at(11) },
  ], NOW);

  assert.equal(days.length, 1);
  assert.equal(days[0].items.length, 1);
  const item = days[0].items[0];
  assert.equal(item.kind, 'follows');
  if (item.kind === 'follows') {
    assert.equal(item.count, 3);
    assert.equal(describeFollowCount(item.count, item.sampleFollowerUsernames), '3 people followed you');
  }

  const single = groupFollowsByDay([{ follower_username: 'maya', created_at: at(9) }], NOW);
  const singleItem = single[0].items[0];
  assert.equal(singleItem.kind, 'follows');
  if (singleItem.kind === 'follows') {
    assert.equal(describeFollowCount(singleItem.count, singleItem.sampleFollowerUsernames), '@maya followed you');
  }
});

test('reports aggregate by question and day', () => {
  const days = groupReportsByQuestionAndDay([
    { question_id: 'q-t', question_text: 'Telephone?', created_at: at(9) },
    { question_id: 'q-t', question_text: 'Telephone?', created_at: at(10) },
  ], NOW);

  assert.equal(days.length, 1);
  assert.equal(days[0].items.length, 1);
  const item = days[0].items[0];
  assert.equal(item.kind, 'reports');
  if (item.kind === 'reports') {
    assert.equal(item.count, 2);
    assert.equal(describeReportCount(2), '2 people think your question might need another look');
  }
});

test('older activity groups under its own day label', () => {
  const days = mergeDigestDays([
    groupAnswersByQuestionAndDay([
      { question_id: 'q-a', question_text: 'Question A?', responder_username: 'a', created_at: at(10) },
      { question_id: 'q-a', question_text: 'Question A?', responder_username: 'b', created_at: at(10, 0, 1) },
    ], NOW),
  ], NOW);

  assert.equal(days.length, 2);
  assert.equal(days[0].label, 'TODAY');
  assert.equal(days[1].label, 'YESTERDAY');
});

test('merging is deterministic: same rows in give same digest out', () => {
  const rows = [
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'a', created_at: at(9) },
    { question_id: 'q-a', question_text: 'Question A?', responder_username: 'b', created_at: at(10) },
  ];
  const first = mergeDigestDays([groupAnswersByQuestionAndDay(rows, NOW)], NOW);
  const second = mergeDigestDays([groupAnswersByQuestionAndDay(rows, NOW)], NOW);
  assert.deepEqual(first, second);
});
