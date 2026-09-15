/**
 * Best-effort answer guessing for twiddlBot.
 *
 * Uses key-less public web APIs (Wikipedia search intros and the DuckDuckGo instant answer
 * API) plus a few heuristics to pick a plausible answer. This module is dependency free and
 * never throws: it returns null when there is nothing trustworthy to go on, so callers can
 * fall back to a simpler guess.
 */

export type WebGuess = {
  answer: string;
  source: 'ddg-answer' | 'ddg-entity' | 'wikipedia' | 'wikipedia-phrase' | 'wikipedia-number';
  confidence: number;
};

type Candidate = {
  answer: string;
  base: number;
  intro: string;
  source: WebGuess['source'];
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'has', 'have', 'had', 'which', 'what', 'who', 'whom', 'whose', 'where', 'when',
  'why', 'how', 'many', 'much', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'these',
  'those', 'it', 'its', 'as', 'by', 'for', 'from', 'with', 'about', 'into', 'over', 'under', 'between',
  'after', 'before', 'during', 'name', 'named', 'called', 'known', 'give', 'tell', 'answer', 'first',
]);

/** Words that end the part of a question describing what is being asked about. */
const CLAUSE_BREAKS = new Set([
  'of', 'on', 'in', 'at', 'for', 'to', 'from', 'by', 'with', 'about', 'into', 'over', 'under',
  'between', 'after', 'before', 'during', 'that', 'which', 'whose', 'who',
]);

const NUMBER_PATTERN = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|\d{1,7})\b/i;
const YEAR_PATTERN = /\b(1[0-9]{3}|20[0-9]{2})\b/;
const CAPITAL_PATTERN = /[Cc]apital of [^.]{0,30}?\b(?:is|was|has been|became)\s+([A-Z][\w'\u2019-]*(?:\s+[A-Z][\w'\u2019-]*){0,2})\b/;
const META_TITLE_PATTERN = /^(list of|lists of|names of|timeline of|history of|outline of|index of|glossary|comparison of|prices of|category:|bibliography|portal:)/i;

export function normalizeGuessPart(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentWords(value: string) {
  return normalizeGuessPart(value).split(' ').filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * The part of the question that names what is being asked about, for example
 * "largest ocean" in "What is the largest ocean on Earth?" (the trailing "on Earth"
 * is scope, not the thing being asked about, and must not drive scoring).
 */
function askedCategoryWords(question: string) {
  const tokens = normalizeGuessPart(question).split(' ').filter(Boolean);
  const breakIndex = tokens.findIndex((token, index) => index > 0 && CLAUSE_BREAKS.has(token) && tokens.slice(0, index).some((word) => word.length > 1 && !STOP_WORDS.has(word)));
  const scope = breakIndex > 0 ? tokens.slice(0, breakIndex) : tokens;
  const words = scope.filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return words.length > 0 ? words : contentWords(question);
}

function cleanTitle(title: string) {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function tidyAnswer(value: string) {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/^the\s+/i, '')
    .replace(/[.;:,!?\s]+$/, '')
    .trim();
}

export function isNumericQuestion(text: string) {
  return /\b(how many|how much|how long|how tall|how high|how old|how deep|what year|which year|when did|when was|when is)\b/i.test(text);
}

function isYearQuestion(text: string) {
  return /\b(what year|which year|when did|when was|in which year)\b/i.test(text);
}

function looksLikeMetaPage(title: string) {
  return META_TITLE_PATTERN.test(title.trim());
}

/** True when every meaningful word of the candidate already appears in the question. */
function looksLikeTopicPage(candidate: string, questionWords: Set<string>) {
  const words = normalizeGuessPart(candidate).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  return words.every((word) => questionWords.has(word) || STOP_WORDS.has(word));
}

/** The page shares at least one meaningful word with the question. */
function titleMatchesQuestion(title: string, questionWords: Set<string>) {
  return normalizeGuessPart(title).split(' ').filter(Boolean).some((word) => questionWords.has(word));
}

/** The page's intro actually talks about the thing the question asks about. */
function introMentionsAskedWords(intro: string, askedWords: string[]) {
  if (!intro) return false;
  const normalized = normalizeGuessPart(intro);
  return askedWords.some((word) => new RegExp(`\\b${word}\\b`).test(normalized));
}

/**
 * Wikipedia intros usually read "<candidate> is a <thing the question asks about>", for
 * example "Jupiter is the fifth planet from the Sun...". That shape is a strong hint that
 * the candidate is the entity the question is after.
 */
function describeBoost(intro: string, candidate: string, askedWords: string[]) {
  if (!intro) return 0;

  const opening = normalizeGuessPart(intro).slice(0, 240);
  const verbMatch = /\b(is|was|are|were)\b/.exec(opening);
  if (!verbMatch) return 0;

  const afterVerb = opening.slice(verbMatch.index, verbMatch.index + 120);
  const candidateWords = new Set(normalizeGuessPart(candidate).split(' '));
  for (const word of askedWords) {
    if (candidateWords.has(word)) continue;
    if (new RegExp(`\\b${word}\\b`).test(afterVerb)) return 0.9;
  }

  return 0;
}

/** "The capital of France has been Paris since ..." style answers. */
function extractCapital(intro: string, question: string) {
  if (!/\bcapital of\b/i.test(question)) return null;
  return intro.match(CAPITAL_PATTERN)?.[1]?.trim() ?? null;
}

function extractNumber(intro: string, yearQuestion: boolean) {
  if (yearQuestion) {
    const year = intro.match(YEAR_PATTERN)?.[1];
    if (year) return year;
  }

  const match = NUMBER_PATTERN.exec(intro);
  if (!match) return null;

  const value = match[1].toLowerCase();
  return /^\d+$/.test(value) ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

async function fetchJson(url: string, timeoutMs = 6000, attempt = 0): Promise<any | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'TwiddlTriviaBot/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // Public APIs throttle bursts; give one short retry before giving up.
      if (attempt === 0 && (response.status === 429 || response.status === 403 || response.status === 503)) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return fetchJson(url, timeoutMs, attempt + 1);
      }
      return null;
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      // Throttle notices come back as plain text rather than JSON.
      if (attempt === 0 && /too many requests|rate limit/i.test(text)) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return fetchJson(url, timeoutMs, attempt + 1);
      }
      return null;
    }
  } catch {
    return null;
  }
}

type WikiPage = {
  title: string;
  index: number;
  extract: string;
  meta: boolean;
};

async function wikipediaSearch(query: string): Promise<WikiPage[]> {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search'
    + `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6`
    + '&prop=extracts&exintro=1&explaintext=1&exsentences=2&exlimit=6&origin=*';
  const data = await fetchJson(url);

  return Object.values((data?.query?.pages ?? {}) as Record<string, any>)
    .filter((page) => typeof page?.title === 'string' && !/disambiguation/i.test(page.title))
    .map((page, position) => {
      const title = cleanTitle(page.title as string);
      return {
        title,
        index: typeof page.index === 'number' ? page.index : position,
        extract: String(page.extract ?? '').replace(/\s+/g, ' '),
        meta: looksLikeMetaPage(title),
      };
    })
    .filter((page) => page.title.length > 0)
    .sort((left, right) => left.index - right.index);
}

/**
 * Wikipedia ranks differently for the raw question ("...has the shortest day?") and for the
 * keyword-only form ("shortest day planet"), so both are searched and the results merged.
 */
async function wikipediaPages(question: string) {
  const keywordQuery = contentWords(question).join(' ');
  const queries = Array.from(new Set([question, keywordQuery].filter((value) => value.trim().length > 2)));

  // Sequential rather than parallel: two searches per question is already enough traffic
  // and bursts are what gets a key-less client throttled.
  const searches: WikiPage[][] = [];
  for (const query of queries) {
    searches.push(await wikipediaSearch(query));
  }

  const best = new Map<string, WikiPage>();
  for (const pages of searches) {
    for (const page of pages) {
      const existing = best.get(page.title);
      if (!existing || page.index < existing.index) best.set(page.title, page);
    }
  }

  return Array.from(best.values());
}

/** Article titles make good answer candidates; list/history pages and unrelated pages do not. */
function titleCandidates(pages: WikiPage[], questionWords: Set<string>, askedWords: string[]) {
  return pages
    .filter((page) => !page.meta)
    .filter((page) => titleMatchesQuestion(page.title, questionWords) || introMentionsAskedWords(page.extract, askedWords))
    .map((page) => ({
      answer: page.title,
      base: Math.max(0.4, 1.2 - 0.06 * page.index),
      intro: page.extract,
      source: 'wikipedia' as const,
    }));
}

/**
 * Returns the most plausible answer found on the web, or null when the heuristics are not
 * confident enough (the caller should then fall back to a simpler guess).
 */
export async function guessAnswerFromWeb(questionText: string): Promise<WebGuess | null> {
  const question = questionText.trim();
  if (question.length < 8) return null;

  const questionWords = new Set(contentWords(question));
  const askedWords = askedCategoryWords(question);
  if (questionWords.size === 0) return null;

  const numeric = isNumericQuestion(question);
  const yearQuestion = isYearQuestion(question);

  const [pages, ddg] = await Promise.all([wikipediaPages(question), duckDuckGoCandidates(question)]);
  const candidates: Candidate[] = [...ddg, ...titleCandidates(pages, questionWords, askedWords)];

  // Pattern based answers are more precise than titles, but only when they come from a page
  // that is actually about what the question asks about. List/history pages are fine as
  // sources for those patterns, they just should not supply the answer themselves.
  for (const page of pages) {
    if (!titleMatchesQuestion(page.title, questionWords)) continue;

    const penalty = page.meta ? 0.2 : 0;

    const capital = extractCapital(page.extract, question);
    if (capital) {
      candidates.push({ answer: capital, base: 2 - penalty, intro: '', source: 'wikipedia-phrase' });
    }

    if (numeric) {
      const number = extractNumber(page.extract, yearQuestion);
      if (number) {
        candidates.push({
          answer: number,
          base: 1.4 - 0.05 * (page.index - 1),
          intro: page.extract,
          source: 'wikipedia-number',
        });
      }
    }
  }

  const scored = candidates.flatMap((candidate) => {
    const words = normalizeGuessPart(candidate.answer).split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 6) return [];
    if (looksLikeTopicPage(candidate.answer, questionWords)) return [];

    const overlap = words.filter((word) => questionWords.has(word)).length / words.length;
    const score = candidate.base
      - 0.05 * words.length
      - 0.5 * overlap
      + describeBoost(candidate.intro, candidate.answer, askedWords);
    const answer = tidyAnswer(candidate.answer);
    if (!answer) return [];

    return [{ answer, source: candidate.source, score }];
  });

  const best = scored.reduce<{ answer: string; source: WebGuess['source']; score: number } | null>(
    (current, entry) => (!current || entry.score > current.score ? entry : current),
    null,
  );

  if (!best || best.score < 0.35) return null;

  return {
    answer: best.answer,
    source: best.source,
    confidence: Math.min(1, Number((best.score / 3).toFixed(2))),
  };
}

/** Match a web guess against a question's options. Returns null when nothing matches well. */
export function pickChoiceFromGuess(choices: string[], guess: WebGuess | null) {
  if (!guess || choices.length === 0) return null;

  const target = normalizeGuessPart(guess.answer);
  if (!target) return null;

  const targetWords = new Set(target.split(' '));
  const scored = choices.map((choice, index) => {
    const normalizedChoice = normalizeGuessPart(choice);
    if (!normalizedChoice) return { index, score: 0 };
    if (normalizedChoice === target) return { index, score: 1 };
    if (target.includes(normalizedChoice) || normalizedChoice.includes(target)) return { index, score: 0.8 };

    const choiceWords = normalizedChoice.split(' ');
    const shared = choiceWords.filter((word) => targetWords.has(word)).length;
    if (shared === 0) return { index, score: 0 };
    return { index, score: Math.min(0.7, 0.7 * (shared / choiceWords.length)) };
  });

  let bestIndex = -1;
  let bestScore = 0;
  for (const entry of scored) {
    if (entry.score > bestScore) {
      bestIndex = entry.index;
      bestScore = entry.score;
    }
  }

  return bestIndex >= 0 && bestScore >= 0.5 ? bestIndex : null;
}

async function duckDuckGoCandidates(question: string) {
  const query = contentWords(question).join(' ') || question;
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`;
  const data = await fetchJson(url);
  const candidates: Candidate[] = [];

  if (typeof data?.Answer === 'string' && data.Answer.trim()) {
    const answer = tidyAnswer(data.Answer);
    if (answer) candidates.push({ answer, base: 3, intro: '', source: 'ddg-answer' });

    // "Gold (Au), atomic number 79..." -> try the leading entity on its own as well.
    const leading = tidyAnswer(answer.split(/[(,;]/)[0] ?? '');
    if (leading && normalizeGuessPart(leading) !== normalizeGuessPart(answer)) {
      candidates.push({ answer: leading, base: 2.8, intro: '', source: 'ddg-answer' });
    }
  }

  const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
  const flattened = related.flatMap((topic: any) => (Array.isArray(topic?.Topics) ? topic.Topics : [topic]));
  flattened.slice(0, 8).forEach((topic: any, index: number) => {
    const text = typeof topic?.Text === 'string' ? topic.Text : '';
    const entity = text.split(' - ')[0]?.trim() ?? '';
    if (entity && entity.length <= 60) {
      candidates.push({ answer: entity, base: 1.6 - 0.05 * index, intro: text, source: 'ddg-entity' });
    }
  });

  return candidates;
}