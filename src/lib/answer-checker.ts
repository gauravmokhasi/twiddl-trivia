const COMMON_ALIASES: Record<string, string[]> = {
  nyc: ['new york city', 'new york'],
  usa: ['united states', 'united states of america', 'america'],
  uk: ['united kingdom', 'great britain', 'england'],
  us: ['united states', 'united states of america', 'america'],
  oz: ['australia'],
};

export function normalizeAnswer(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

function answerVariants(value: string) {
  const normalized = normalizeAnswer(value);
  return [normalized, ...(COMMON_ALIASES[normalized] ?? [])].map(normalizeAnswer);
}

export function isAnswerCorrect(submittedAnswer: string, expectedAnswer: string) {
  const submittedVariants = answerVariants(submittedAnswer).filter(Boolean);
  const expectedVariants = expectedAnswer
    .split(/[|,;]/)
    .flatMap(answerVariants)
    .filter(Boolean);

  return submittedVariants.some((submitted) => expectedVariants.some((expected) => {
    if (submitted === expected) return true;

    const distance = levenshteinDistance(submitted, expected);
    const allowedDistance = Math.max(1, Math.floor(Math.min(submitted.length, expected.length) / 5));
    if (distance <= allowedDistance) return true;

    const submittedWords = new Set(submitted.split(' '));
    const expectedWords = expected.split(' ');
    const sharedWords = expectedWords.filter((word) => submittedWords.has(word)).length;
    return expectedWords.length > 1 && sharedWords / expectedWords.length >= 0.75;
  }));
}

export type SplitAcceptedAnswer = {
  primary: string;
  aliases: string[];
};

/**
 * Free-text answers can be stored as "Paris, City of Light | Parisian", where the extra entries
 * are accepted aliases. Split them so the UI can name the main answer without dumping the raw
 * comma list on whoever got it wrong.
 */
export function splitAcceptedAnswers(storedAnswer: string): SplitAcceptedAnswer {
  const parts = storedAnswer.split(/[|,;]/).map((part) => part.trim()).filter(Boolean);
  return { primary: parts[0] ?? storedAnswer.trim(), aliases: parts.slice(1) };
}

/**
 * A friendlier explanation of a free-text answer: the main answer first, then the extra forms
 * that would also have been accepted, then a reminder that near misses pass too.
 */
export function describeAcceptedAnswer(storedAnswer: string) {
  const { primary, aliases } = splitAcceptedAnswers(storedAnswer);
  const aliasesSentence = aliases.length > 0 ? ` We would also have accepted ${aliases.join(', ')}.` : '';
  return `The correct answer is ${primary}.${aliasesSentence} Minor deviations like punctuation, capitalisation or a small typo are accepted too.`;
}
