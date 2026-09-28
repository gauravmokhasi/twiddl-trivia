import { GROQ_MODEL, describeGroqFailure, getGroqClient } from '@/lib/groq-client';

/**
 * Blind trivia answering with Groq. The question text is sent on its own and never the answer key,
 * so the reply is a genuine attempt. Used by twiddlBot when answering other people's questions, and
 * by the question generator to sanity-check its own output.
 */

const ANSWER_MAX_TOKENS = 256;

const ANSWER_SYSTEM_PROMPT = `You answer trivia questions. Reply with a single JSON object, and nothing else, using exactly this key:
- "answer": your single best answer, kept as short as possible: a name, word, place, number or short phrase.

Follow what the clues point to, and give your best guess if you are unsure.`;

function collapse(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForMatch(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Asks Groq for an answer. Throws on API errors so callers that care about retry behaviour (the
 * generator's self-check) can classify the failure. Use guessAnswerWithGroq for the forgiving path.
 */
export async function requestGroqAnswer(questionText: string): Promise<string> {
  const client = getGroqClient();
  if (!client) throw new Error('GROQ_API_KEY is not configured');

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: ANSWER_SYSTEM_PROMPT },
      { role: 'user', content: `${questionText}\n\nWhat is the answer?` },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: ANSWER_MAX_TOKENS,
    reasoning_effort: 'low',
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return '';

  try {
    return collapse(String((JSON.parse(content) as { answer?: unknown }).answer ?? ''));
  } catch {
    return '';
  }
}

/**
 * Forgiving wrapper: returns null when Groq is unavailable or gives nothing usable, so the caller
 * can fall back to a simpler guess.
 */
export async function guessAnswerWithGroq(questionText: string): Promise<string | null> {
  try {
    const answer = await requestGroqAnswer(questionText);
    if (answer) return answer;

    console.warn('[twiddlBot] Groq returned no usable answer - falling back to a simpler guess');
    return null;
  } catch (error) {
    const failure = describeGroqFailure(error);
    console.warn(`[twiddlBot] Groq answer guess failed (${failure.kind}): ${failure.message} - falling back to a simpler guess`);
    return null;
  }
}

/** Maps a free-text guess onto a set of choices. Returns null when nothing matches well enough. */
export function matchGuessToChoices(choices: string[], guess: string | null) {
  if (!guess) return null;

  const target = normalizeForMatch(guess);
  if (!target) return null;

  const targetWords = new Set(target.split(' '));
  let bestIndex = -1;
  let bestScore = 0;

  choices.forEach((choice, index) => {
    const normalizedChoice = normalizeForMatch(choice);
    if (!normalizedChoice) return;

    let score = 0;
    if (normalizedChoice === target) {
      score = 1;
    } else if (target.includes(normalizedChoice) || normalizedChoice.includes(target)) {
      score = 0.8;
    } else {
      const choiceWords = normalizedChoice.split(' ');
      const shared = choiceWords.filter((word) => targetWords.has(word)).length;
      score = shared === 0 ? 0 : Math.min(0.7, 0.7 * (shared / choiceWords.length));
    }

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex >= 0 && bestScore >= 0.5 ? bestIndex : null;
}