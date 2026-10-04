/**
 * Twiddl Pulse: a per-day activity summary for a profile, derived from data the profile page
 * already loads plus one aggregate query (see the profile page). Everything here is pure so the
 * scoring rules can be checked without a database.
 *
 * Day boundaries use UTC via toISOString().slice(0, 10), matching currentQaStreak in lib/streak.ts.
 */

export const PULSE_WINDOW_DAYS = 35; // 5 weeks, so the grid is a clean whole number of columns
export const PULSE_MAX_SCORE = 5;

/** Row labels, indexed by getUTCDay() (0 = Sunday) so they line up with buildPulseWeeks. */
export const PULSE_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_MS = 24 * 60 * 60 * 1000;

export type PulseDay = {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  /** 0-5 active score. Passive-only days keep the received bonus here but are drawn differently. */
  score: number;
  asked: number;
  answered: number;
  received: number;
  /** True when the only activity was other people answering this user's questions. */
  passiveOnly: boolean;
};

export function pulseDayKey(value: string | Date) {
  return (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10);
}

/** Points from asking, capped at one per day: Twiddl allows a single question per day. */
export function askedPoints(asked: number) {
  return asked >= 1 ? 1 : 0;
}

/** Points from answering: 1 answer +1, 2-3 +2, 4 or more +3. */
export function answeredPoints(answered: number) {
  if (answered <= 0) return 0;
  if (answered === 1) return 1;
  if (answered <= 3) return 2;
  return 3;
}

/** Points from receiving: a single binary bonus however many answers arrived. */
export function receivedPoints(received: number) {
  return received >= 1 ? 1 : 0;
}

export function pulseScore(counts: { asked: number; answered: number; received: number }) {
  const score = askedPoints(counts.asked) + answeredPoints(counts.answered) + receivedPoints(counts.received);
  return Math.max(0, Math.min(PULSE_MAX_SCORE, score));
}

function countByDay(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = pulseDayKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Builds one entry per calendar day for the display window, oldest first.
 *
 * asking and answering are counted independently from what is actually stored rather than assuming
 * the usual "ask first, then answer" relationship.
 */
export function buildPulseDays(options: {
  askedDates: string[];
  answeredDates: string[];
  /** Timestamps of answers left by OTHER users on this user's questions. */
  receivedDates: string[];
  today?: Date;
}): PulseDay[] {
  const today = options.today ?? new Date();
  const askedByDay = countByDay(options.askedDates);
  const answeredByDay = countByDay(options.answeredDates);
  const receivedByDay = countByDay(options.receivedDates);

  const end = pulseDayKey(today);
  const days: PulseDay[] = [];

  for (let offset = PULSE_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const date = pulseDayKey(new Date(today.getTime() - offset * DAY_MS));
    if (date > end) continue;

    const asked = askedByDay.get(date) ?? 0;
    const answered = answeredByDay.get(date) ?? 0;
    const received = receivedByDay.get(date) ?? 0;
    const counts = { asked, answered, received };

    days.push({
      date,
      score: pulseScore(counts),
      asked,
      answered,
      received,
      passiveOnly: asked === 0 && answered === 0 && received >= 1,
    });
  }

  return days;
}

export type PulseWeek = (PulseDay | null)[];

/** A fresh week column: seven rows, all empty. */
function emptyWeek(): PulseWeek {
  return [null, null, null, null, null, null, null];
}

/**
 * Groups days into week columns so a weekday always sits on the same row. Cells before the window
 * (and after the last day) are null placeholders, which the view renders as empty space.
 */
export function buildPulseWeeks(days: PulseDay[]): PulseWeek[] {
  if (days.length === 0) return [];

  const weeks: PulseWeek[] = [];
  let current = emptyWeek();

  for (const day of days) {
    const weekday = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 && current.some(Boolean)) {
      weeks.push(current);
      current = emptyWeek();
    }
    current[weekday] = day;
  }

  if (current.some(Boolean)) weeks.push(current);
  return weeks;
}

const MONTH_LABEL_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' };

function monthLabel(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', MONTH_LABEL_FORMAT);
}

/**
 * One label per week column: the month name on the column where that month begins, otherwise an
 * empty string. Keeps headings from repeating down the whole grid, and keeps each slot the same
 * width as the day cells below it.
 *
 * A column is labelled when it contains the first of a month, not merely when its own first day
 * starts a new month. Without that, a month that begins mid-week would never get a heading, which is
 * common in a one-month window.
 */
export function buildPulseMonthLabels(weeks: PulseWeek[]): string[] {
  let previous = '';

  return weeks.map((week, index) => {
    const days = week.filter((day): day is PulseDay => day !== null);
    if (days.length === 0) return '';

    const firstOfMonth = days.find((day) => day.date.endsWith('-01'));
    // Only the very first column falls back to its own month, so the grid always opens with a label.
    const anchor = firstOfMonth ?? (index === 0 ? days[0] : null);
    if (!anchor) return '';

    const month = monthLabel(anchor.date);
    if (month === previous) return '';

    previous = month;
    return month;
  });
}

const MONTH_DAY_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

/** "May 16" in a fixed locale and timezone so server and client render identically. */
export function formatPulseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', MONTH_DAY_FORMAT);
}

/** Tooltip rows for a day. Only rows that actually apply are returned. */
export function describePulseDay(day: PulseDay) {
  const rows: string[] = [];

  if (day.asked === 1) rows.push('1 question asked');
  else if (day.asked > 1) rows.push(`${day.asked} questions asked`);

  if (day.answered === 1) rows.push('1 question answered');
  else if (day.answered > 1) rows.push(`${day.answered} questions answered`);

  if (day.passiveOnly) {
    // Received-only days read as something happening around their questions, never as a negative.
    rows.push(day.received === 1 ? '1 answer received on your questions' : `${day.received} answers received on your questions`);
    return { date: formatPulseDate(day.date), rows };
  }

  if (day.received === 1) rows.push('1 answer received');
  else if (day.received > 1) rows.push(`${day.received} answers received`);

  return { date: formatPulseDate(day.date), rows };
}

/** Screen-reader label: date plus the same facts, or "No activity". */
export function pulseAriaLabel(day: PulseDay) {
  const { date, rows } = describePulseDay(day);
  return rows.length === 0 ? `${date}: No activity` : `${date}: ${rows.join(', ')}`;
}