import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_REPORT_SUMMARY,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  describeReportCount,
  isReportReason,
  summarizeQuestionReports,
} from './question-reports';

type Row = Parameters<typeof summarizeQuestionReports>[0][number];
type Profile = Parameters<typeof summarizeQuestionReports>[1][number];

function row(reporterId: string, reason: Row['reason'] = 'answer_wrong', isAnonymous = false): Row {
  return { reporter_id: reporterId, reason, is_anonymous: isAnonymous };
}

function profile(id: string, username: string, displayName: string | null = null): Profile {
  return { id, username, display_name: displayName };
}

test('every reason has a label', () => {
  for (const reason of REPORT_REASONS) {
    assert.equal(typeof REPORT_REASON_LABELS[reason], 'string');
    assert.ok(REPORT_REASON_LABELS[reason].length > 0);
  }
});

test('known reasons are accepted', () => {
  assert.equal(isReportReason('answer_wrong'), true);
  assert.equal(isReportReason('ambiguous'), true);
});

test('unknown reasons are rejected', () => {
  assert.equal(isReportReason('spam'), false);
  assert.equal(isReportReason(''), false);
  assert.equal(isReportReason('ANSWER_WRONG'), false);
  assert.equal(isReportReason(undefined), false);
  assert.equal(isReportReason(null), false);
  assert.equal(isReportReason(2), false);
  assert.equal(isReportReason({ reason: 'answer_wrong' }), false);
});

test('no reports produces the empty summary', () => {
  assert.deepEqual(summarizeQuestionReports([], []), EMPTY_REPORT_SUMMARY);
});

test('a single named report resolves the reporter', () => {
  const summary = summarizeQuestionReports([row('u1')], [profile('u1', 'maya', 'Maya')]);

  assert.equal(summary.total, 1);
  assert.equal(summary.anonymousCount, 0);
  assert.deepEqual(summary.named, [
    { reporterId: 'u1', username: 'maya', displayName: 'Maya', reason: 'answer_wrong' },
  ]);
});

test('anonymous reports count towards the total but never carry a name', () => {
  const summary = summarizeQuestionReports([row('u1', 'ambiguous', true)], [profile('u1', 'maya', 'Maya')]);

  assert.equal(summary.total, 1);
  assert.equal(summary.anonymousCount, 1);
  assert.deepEqual(summary.named, []);
});

test('named and anonymous reports are counted separately', () => {
  const summary = summarizeQuestionReports(
    [row('u1'), row('u2', 'ambiguous'), row('u3', 'answer_wrong', true)],
    [profile('u1', 'maya'), profile('u2', 'jamie'), profile('u3', 'sam')],
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.anonymousCount, 1);
  assert.deepEqual(summary.named.map((entry) => entry.username), ['maya', 'jamie']);
});

test('the reason travels with each named reporter', () => {
  const summary = summarizeQuestionReports(
    [row('u1', 'ambiguous'), row('u2', 'answer_wrong')],
    [profile('u1', 'maya'), profile('u2', 'jamie')],
  );

  assert.deepEqual(summary.named.map((entry) => entry.reason), ['ambiguous', 'answer_wrong']);
});

test('a reporter without a display name keeps a null one', () => {
  const summary = summarizeQuestionReports([row('u1')], [profile('u1', 'maya')]);

  assert.equal(summary.named[0].displayName, null);
});

test('a named report from an unresolved profile is counted as anonymous', () => {
  const summary = summarizeQuestionReports([row('ghost')], []);

  assert.equal(summary.total, 1);
  assert.equal(summary.anonymousCount, 1);
  assert.deepEqual(summary.named, []);
});

test('reporter order follows the incoming rows', () => {
  const summary = summarizeQuestionReports(
    [row('u3'), row('u1'), row('u2')],
    [profile('u1', 'maya'), profile('u2', 'jamie'), profile('u3', 'sam')],
  );

  assert.deepEqual(summary.named.map((entry) => entry.username), ['sam', 'maya', 'jamie']);
});

test('summarizing never mutates the shared empty summary', () => {
  summarizeQuestionReports([row('u1', 'ambiguous', true)], []);

  assert.deepEqual(EMPTY_REPORT_SUMMARY, { total: 0, anonymousCount: 0, named: [] });
});

test('every row is counted in the total', () => {
  const rows = [row('u1'), row('u2', 'ambiguous', true), row('ghost'), row('u3', 'ambiguous')];

  assert.equal(summarizeQuestionReports(rows, [profile('u1', 'maya')]).total, rows.length);
});

test('zero reports has no headline', () => {
  assert.equal(describeReportCount(0), '');
});

test('a negative count has no headline', () => {
  assert.equal(describeReportCount(-1), '');
});

test('one report reads in the singular', () => {
  assert.equal(describeReportCount(1), '1 person thinks something is off with this question');
});

test('several reports read in the plural', () => {
  assert.equal(describeReportCount(2), '2 people think something is off with this question');
  assert.equal(describeReportCount(9), '9 people think something is off with this question');
});