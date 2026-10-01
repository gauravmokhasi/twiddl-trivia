import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PULSE_MAX_SCORE,
  PULSE_WINDOW_DAYS,
  answeredPoints,
  buildPulseDays,
  buildPulseWeeks,
  describePulseDay,
  pulseAriaLabel,
  pulseScore,
} from './pulse';

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed reference day so these tests never drift with the calendar.
const TODAY = new Date('2026-05-20T12:00:00.000Z');

function iso(daysAgo: number, hour = 12) {
  const key = new Date(TODAY.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);
  return `${key}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

function dayFor(days: ReturnType<typeof buildPulseDays>, daysAgo: number) {
  const key = new Date(TODAY.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);
  const day = days.find((entry) => entry.date === key);
  assert.ok(day, `expected a day entry for ${key}`);
  return day;
}

function build(dates: { asked?: string[]; answered?: string[]; received?: string[] }) {
  return buildPulseDays({
    askedDates: dates.asked ?? [],
    answeredDates: dates.answered ?? [],
    receivedDates: dates.received ?? [],
    today: TODAY,
  });
}

test('1. no activity yields an inactive window', () => {
  const days = build({});
  assert.equal(days.length, PULSE_WINDOW_DAYS);
  assert.ok(days.every((day) => day.score === 0 && !day.passiveOnly));
  assert.ok(days.every((day) => day.asked === 0 && day.answered === 0 && day.received === 0));
});

test('2. asking one question scores 1', () => {
  assert.equal(dayFor(build({ asked: [iso(1)] }), 1).score, 1);
});

test('3. asking plus one answer scores 2', () => {
  assert.equal(dayFor(build({ asked: [iso(1)], answered: [iso(1)] }), 1).score, 2);
});

test('4. asking plus two or three answers scores 3', () => {
  assert.equal(dayFor(build({ asked: [iso(1)], answered: [iso(1), iso(1)] }), 1).score, 3);
  assert.equal(dayFor(build({ asked: [iso(1)], answered: [iso(1), iso(1), iso(1)] }), 1).score, 3);
});

test('5. asking plus four or more answers scores 4', () => {
  const answered = [iso(1), iso(1), iso(1), iso(1)];
  assert.equal(dayFor(build({ asked: [iso(1)], answered }), 1).score, 4);
  const many = new Array(9).fill(iso(1));
  assert.equal(dayFor(build({ asked: [iso(1)], answered: many }), 1).score, 4);
});

test('6. a received answer adds the fifth point', () => {
  const answered = [iso(1), iso(1), iso(1), iso(1)];
  assert.equal(dayFor(build({ asked: [iso(1)], answered, received: [iso(1)] }), 1).score, PULSE_MAX_SCORE);
});

test('7. received answers only is passive activity', () => {
  const day = dayFor(build({ received: [iso(2), iso(2)] }), 2);
  assert.equal(day.passiveOnly, true);
  assert.equal(day.score, 1);
  assert.match(describePulseDay(day).rows.join(' '), /2 answers received on your questions/);
});

test('8. answering plus received answers, with no question that day, still scores correctly', () => {
  const day = dayFor(build({ answered: [iso(3)], received: [iso(3)] }), 3);
  assert.equal(day.asked, 0);
  assert.equal(day.passiveOnly, false);
  assert.equal(day.score, 2);
});

test('9. several received answers still add a single point', () => {
  assert.equal(receivedOnlyScore(1), receivedOnlyScore(6));
  function receivedOnlyScore(count: number) {
    const received = new Array(count).fill(iso(4));
    return dayFor(build({ received }), 4).score;
  }
});

test('10. more than one question in a day still awards a single asking point', () => {
  assert.equal(dayFor(build({ asked: [iso(5), iso(5), iso(5)] }), 5).score, 1);
});

test('11. day counts are computed independently for asking and answering', () => {
  const day = dayFor(build({ answered: [iso(6), iso(6), iso(6), iso(6)], received: [iso(6)] }), 6);
  assert.equal(day.asked, 0);
  assert.equal(day.answered, 4);
  assert.equal(day.received, 1);
  assert.equal(day.score, 4);
});

test('12. the window covers the last year and excludes older activity', () => {
  const days = build({ asked: [iso(PULSE_WINDOW_DAYS + 30)] });
  assert.equal(days.length, PULSE_WINDOW_DAYS);
  assert.ok(days.every((day) => day.score === 0), 'activity older than the window must not appear');
  assert.equal(days[days.length - 1].date, TODAY.toISOString().slice(0, 10));
});

test('13. the grid aligns each weekday to its own row', () => {
  const weeks = buildPulseWeeks(build({ asked: [iso(0)] }));
  assert.ok(weeks.length > 50);
  assert.ok(weeks.every((week) => week.length === 7));

  const todayWeekday = TODAY.getUTCDay();
  const lastWeek = weeks[weeks.length - 1];
  assert.equal(lastWeek[todayWeekday]?.date, TODAY.toISOString().slice(0, 10));
  assert.ok(lastWeek.filter((day, index) => index > todayWeekday).every((day) => day === null));
});

test('14. scores never exceed the documented range', () => {
  const answered = new Array(40).fill(iso(7));
  const received = new Array(40).fill(iso(7));
  const score = dayFor(build({ asked: [iso(7)], answered, received }), 7).score;
  assert.equal(score, PULSE_MAX_SCORE);
  assert.ok(answeredPoints(0) === 0 && answeredPoints(1) === 1 && answeredPoints(3) === 2 && answeredPoints(4) === 3);
  assert.equal(pulseScore({ asked: 0, answered: 0, received: 0 }), 0);
});

test('15. labels describe the day without exposing point maths', () => {
  const day = dayFor(build({ asked: [iso(8)], answered: [iso(8), iso(8)], received: [iso(8)] }), 8);
  const detail = describePulseDay(day);
  assert.deepEqual(detail.rows, ['1 question asked', '2 questions answered', '1 answer received']);
  assert.match(pulseAriaLabel(day), /2 questions answered/);
  assert.ok(detail.rows.every((row) => !/[+-]\d|\d+ points?/.test(row)));

  const idle = dayFor(build({}), 9);
  assert.deepEqual(describePulseDay(idle).rows, []);
  assert.match(pulseAriaLabel(idle), /No activity/);
});