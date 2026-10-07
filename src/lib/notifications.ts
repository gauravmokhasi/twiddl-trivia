export type DigestDayBucket = {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  label: 'TODAY' | 'YESTERDAY' | string;
};

export type AnswerDigestItem = {
  kind: 'answers';
  questionId: string;
  questionText: string;
  count: number;
  /** Newest activity in the bucket, for "xh ago" display. */
  latestAt: string;
  sampleResponderUsernames: string[];
};

export type ReportDigestItem = {
  kind: 'reports';
  questionId: string;
  questionText: string;
  count: number;
  latestAt: string;
};

export type FollowDigestItem = {
  kind: 'follows';
  count: number;
  latestAt: string;
  sampleFollowerUsernames: string[];
};

export type DigestItem = AnswerDigestItem | ReportDigestItem | FollowDigestItem;

export type DigestDay = DigestDayBucket & {
  items: DigestItem[];
};

export function utcDayKey(value: string | Date): string {
  return (typeof value === 'string' ? new Date(value) : value).toISOString().slice(0, 10);
}

function dayLabel(day: string, todayKey: string, yesterdayKey: string): DigestDayBucket['label'] {
  if (day === todayKey) return 'TODAY';
  if (day === yesterdayKey) return 'YESTERDAY';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export type AnswerRow = {
  question_id: string;
  question_text: string;
  responder_username: string | null;
  created_at: string;
};

export type ReportRow = {
  question_id: string;
  question_text: string;
  created_at: string;
};

export type FollowRow = {
  follower_username: string | null;
  created_at: string;
};

/**
 * Groups answer rows by question + UTC day. One output item per
 * (question, day) pair, newest day first, newest question activity first.
 */
export function groupAnswersByQuestionAndDay(rows: AnswerRow[], now = new Date()): DigestDay[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const byKey = new Map<string, AnswerDigestItem & { day: string }>();

  for (const row of rows) {
    const day = utcDayKey(row.created_at);
    const key = `${day} ${row.question_id}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        kind: 'answers',
        day,
        questionId: row.question_id,
        questionText: row.question_text,
        count: 1,
        latestAt: row.created_at,
        sampleResponderUsernames: row.responder_username ? [row.responder_username] : [],
      });
      continue;
    }

    existing.count += 1;
    if (row.created_at > existing.latestAt) existing.latestAt = row.created_at;
    if (
      row.responder_username
      && existing.sampleResponderUsernames.length < 3
      && !existing.sampleResponderUsernames.includes(row.responder_username)
    ) {
      existing.sampleResponderUsernames.push(row.responder_username);
    }
  }

  return collectDays(byKey, todayKey, yesterdayKey);
}

/** Groups report rows by question + UTC day, same shape as answers. */
export function groupReportsByQuestionAndDay(rows: ReportRow[], now = new Date()): DigestDay[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const byKey = new Map<string, ReportDigestItem & { day: string }>();

  for (const row of rows) {
    const day = utcDayKey(row.created_at);
    const key = `${day} ${row.question_id}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        kind: 'reports',
        day,
        questionId: row.question_id,
        questionText: row.question_text,
        count: 1,
        latestAt: row.created_at,
      });
      continue;
    }

    existing.count += 1;
    if (row.created_at > existing.latestAt) existing.latestAt = row.created_at;
  }

  return collectDays(byKey, todayKey, yesterdayKey);
}

/** Groups follow rows by UTC day: one item per day, newest first. */
export function groupFollowsByDay(rows: FollowRow[], now = new Date()): DigestDay[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const byKey = new Map<string, FollowDigestItem & { day: string }>();

  for (const row of rows) {
    const day = utcDayKey(row.created_at);
    const existing = byKey.get(day);

    if (!existing) {
      byKey.set(day, {
        kind: 'follows',
        day,
        count: 1,
        latestAt: row.created_at,
        sampleFollowerUsernames: row.follower_username ? [row.follower_username] : [],
      });
      continue;
    }

    existing.count += 1;
    if (row.created_at > existing.latestAt) existing.latestAt = row.created_at;
    if (
      row.follower_username
      && existing.sampleFollowerUsernames.length < 3
      && !existing.sampleFollowerUsernames.includes(row.follower_username)
    ) {
      existing.sampleFollowerUsernames.push(row.follower_username);
    }
  }

  return collectDays(byKey, todayKey, yesterdayKey);
}

/**
 * Merges per-category day groups into one day-ordered digest. Days newest
 * first; within a day, items ordered by latest activity.
 */
export function mergeDigestDays(groups: DigestDay[][], now = new Date()): DigestDay[] {
  const todayKey = utcDayKey(now);
  const yesterdayKey = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const byDay = new Map<string, DigestItem[]>();

  for (const days of groups) {
    for (const day of days) {
      const items = byDay.get(day.day) ?? [];
      items.push(...day.items);
      byDay.set(day.day, items);
    }
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([day, items]) => ({
      day,
      label: dayLabel(day, todayKey, yesterdayKey),
      items: items.sort((left, right) => (left.latestAt < right.latestAt ? 1 : -1)),
    }));
}

function collectDays<T extends { day: string; latestAt: string }>(
  byKey: Map<string, T>,
  todayKey: string,
  yesterdayKey: string,
): DigestDay[] {
  const byDay = new Map<string, DigestItem[]>();

  for (const entry of byKey.values()) {
    const { day, ...item } = entry;
    const items = byDay.get(day) ?? [];
    items.push(item as unknown as DigestItem);
    byDay.set(day, items);
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([day, items]) => ({
      day,
      label: dayLabel(day, todayKey, yesterdayKey),
      items: items.sort((left, right) => (left.latestAt < right.latestAt ? 1 : -1)),
    }));
}

/** "3 people answered your question" / "1 person answered your question". */
export function describeAnswerCount(count: number): string {
  return count === 1 ? '1 person answered your question' : `${count} people answered your question`;
}

/** "2 people think your question might need another look". */
export function describeReportCount(count: number): string {
  return count === 1
    ? '1 person thinks your question might need another look'
    : `${count} people think your question might need another look`;
}

/** Single follower names them; multiples aggregate. */
export function describeFollowCount(count: number, sampleUsernames: string[]): string {
  if (count === 1 && sampleUsernames[0]) return `@${sampleUsernames[0]} followed you`;
  return count === 1 ? '1 person followed you' : `${count} people followed you`;
}


