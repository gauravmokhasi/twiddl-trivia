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
