const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function currentQaStreak(askedDates: string[], answeredDates: string[]) {
  const asked = new Set(askedDates.map(dayKey));
  const answered = new Set(answeredDates.map(dayKey));
  const qualifyingDays = new Set([...asked].filter((date) => answered.has(date)));
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10);
  let cursor = qualifyingDays.has(todayKey) ? today : new Date(today.getTime() - DAY_MS);
  let streak = 0;

  while (qualifyingDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }

  if (!qualifyingDays.has(todayKey) && !qualifyingDays.has(yesterdayKey)) {
    return 0;
  }

  return streak;
}
