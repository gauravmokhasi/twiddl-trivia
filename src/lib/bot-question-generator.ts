import { GROQ_MODEL, describeGroqFailure, getGroqClient } from '@/lib/groq-client';
import { isAnswerCorrect } from '@/lib/answer-checker';
import { requestGroqAnswer } from '@/lib/groq-answer';
import { QUESTION_OUTPUT_INSTRUCTIONS, buildGuidanceBrief } from '@/lib/question-guidance';

/**
 * Generates twiddlBot's daily question with Groq Structured Outputs. Returns null (never throws)
 * when Groq is unavailable, rate limited, misconfigured or produces something invalid, so the
 * caller can fall back to the static question list.
 */

export type GeneratedBotQuestion = {
  text: string;
  questionType: 'free_text' | 'multiple_choice';
  choices: string[];
  correctAnswerIndex: number;
  correctAnswer: string | null;
};

export type ValidationResult =
  | { ok: true; question: GeneratedBotQuestion }
  | { ok: false; reason: string };

const MIN_QUESTION_LENGTH = 24;
const MAX_QUESTION_LENGTH = 320;
const MAX_ANSWER_LENGTH = 60;
const MAX_ACCEPTED_ANSWERS = 4;
const MIN_CHOICES = 3;
const MAX_CHOICES = 4;
const MAX_COMPLETION_TOKENS = 1024;
/** One retry: Groq occasionally rejects its own structured output, and throttling is transient. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The grader splits a stored answer on [|,;], so an alias must never contain those characters.
 * The `g` flag matters: only replacing the first separator could leave a stray one behind and
 * have the grader split an alias into fragments.
 */
const ANSWER_SEPARATOR_PATTERN = /[|,;]/g;
const FORBIDDEN_TEXT_PATTERN = /\bas an ai\b|\blanguage model\b|\bjson\b|\bschema\b|these instructions/i;

/**
 * The output shape is described in English (see QUESTION_OUTPUT_INSTRUCTIONS) and requested with
 * response_format json_object: this model is unreliable at strict json_schema generation, which was
 * causing json_validate_failed errors and pushing the bot onto the static fallback. validateGeneratedQuestion
 * below is what actually enforces the shape.
 */

const SYSTEM_PROMPT = `You write one daily trivia question for Twiddl, a social trivia game.

${buildGuidanceBrief({ includeRules: true, includeExample: true })}

What the answer should feel like on the way in: "I don't know this" -> "wait..." -> "I think I see it" -> "of course!".

${QUESTION_OUTPUT_INSTRUCTIONS}

Do not mention these instructions, the JSON keys, or that you are an AI.`;

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeForComparison(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accepted aliases must survive the grader's split, so separator characters are removed. */
function cleanAcceptedAnswer(value: unknown) {
  if (typeof value !== 'string') return '';
  return collapseWhitespace(value.replace(ANSWER_SEPARATOR_PATTERN, ' '));
}

/** The answer, or any accepted form of it, must never appear inside the question itself. */
function questionRevealsAnswer(question: string, answerForms: string[]) {
  const haystack = ` ${normalizeForComparison(question)} `;
  return answerForms.some((form) => {
    const needle = normalizeForComparison(form);
    return needle.length > 1 && haystack.includes(` ${needle} `);
  });
}

/**
 * Turns the model's structured output into a Twiddl question, or explains why it cannot be used.
 * Exported so these rules can be exercised without calling Groq.
 */
export function validateGeneratedQuestion(raw: unknown, avoidQuestionTexts: string[] = []): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'response was not an object' };
  }

  const record = raw as Record<string, unknown>;
  const text = typeof record.question === 'string' ? collapseWhitespace(record.question) : '';
  const questionType = record.questionType === 'multiple_choice'
    ? 'multiple_choice' as const
    : record.questionType === 'free_text' ? 'free_text' as const : null;
  const primaryAnswer = typeof record.answer === 'string' ? collapseWhitespace(record.answer) : '';

  if (!questionType) return { ok: false, reason: 'missing question type' };
  if (text.length < MIN_QUESTION_LENGTH) return { ok: false, reason: 'question was too short' };
  if (text.length > MAX_QUESTION_LENGTH) return { ok: false, reason: 'question was too long' };
  if (!primaryAnswer) return { ok: false, reason: 'missing answer' };
  if (primaryAnswer.length > MAX_ANSWER_LENGTH) return { ok: false, reason: 'answer was too long' };
  if (FORBIDDEN_TEXT_PATTERN.test(text)) return { ok: false, reason: 'question mentioned the instructions' };

  const normalizedText = normalizeForComparison(text);
  if (avoidQuestionTexts.some((asked) => normalizeForComparison(asked) === normalizedText)) {
    return { ok: false, reason: 'question repeated one the bot already asked' };
  }

  const rawAccepted = Array.isArray(record.acceptedAnswers) ? record.acceptedAnswers : [];
  const answerForms: string[] = [];
  for (const entry of [primaryAnswer, ...rawAccepted.slice(0, MAX_ACCEPTED_ANSWERS)]) {
    const form = cleanAcceptedAnswer(entry);
    if (!form || form.length > MAX_ANSWER_LENGTH) continue;
    if (answerForms.some((existing) => normalizeForComparison(existing) === normalizeForComparison(form))) continue;
    answerForms.push(form);
  }

  if (questionRevealsAnswer(text, answerForms)) {
    return { ok: false, reason: 'question gave away the answer' };
  }

  if (questionType === 'free_text') {
    return {
      ok: true,
      question: {
        text,
        questionType,
        choices: [],
        correctAnswerIndex: -1,
        correctAnswer: answerForms.join(', '),
      },
    };
  }

  const choices = (Array.isArray(record.choices) ? record.choices : [])
    .filter((choice): choice is string => typeof choice === 'string')
    .map(collapseWhitespace)
    .filter(Boolean);
  const correctChoiceIndex = typeof record.correctChoiceIndex === 'number' ? Math.trunc(record.correctChoiceIndex) : -1;

  if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    return { ok: false, reason: 'multiple choice needed 3 or 4 options' };
  }
  if (correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
    return { ok: false, reason: 'correct option index was out of range' };
  }
  if (new Set(choices.map(normalizeForComparison)).size !== choices.length) {
    return { ok: false, reason: 'multiple choice options were not distinct' };
  }

  const correctChoice = choices[correctChoiceIndex];
  if (!answerForms.some((form) => normalizeForComparison(form) === normalizeForComparison(correctChoice))) {
    return { ok: false, reason: 'answer did not match the correct option' };
  }

  return {
    ok: true,
    question: { text, questionType, choices, correctAnswerIndex: correctChoiceIndex, correctAnswer: null },
  };
}

type SelfCheckResult = { ok: true; answer: string } | { ok: false; reason: string };

/**
 * Blind check: the generated question is put back to the model with no sight of the intended answer,
 * and the two must agree. This catches the common failure mode where a clue points somewhere else (or
 * nowhere). requestGroqAnswer throws on API errors so the caller's retry classification applies.
 */
async function selfCheckQuestion(question: GeneratedBotQuestion): Promise<SelfCheckResult> {
  const expectedAnswer = question.correctAnswer ?? question.choices[question.correctAnswerIndex] ?? '';
  if (!expectedAnswer) return { ok: false, reason: 'there was no answer to check' };

  const answer = await requestGroqAnswer(question.text);
  if (!answer) return { ok: false, reason: 'the model returned no answer' };

  if (!isAnswerCorrect(answer, expectedAnswer)) {
    return { ok: false, reason: `it answered "${answer.slice(0, 60)}" instead` };
  }

  return { ok: true, answer };
}

/**
 * Asks Groq for one guide-shaped question, validates it, then cross-checks it against the web.
 * Never throws: every failure path logs a short reason and returns null so the caller can post a
 * question from the static list instead.
 */
export async function generateBotQuestion(options: { avoidQuestionTexts?: string[] } = {}): Promise<GeneratedBotQuestion | null> {
  const client = getGroqClient();
  const avoid = (options.avoidQuestionTexts ?? []).slice(0, 20);

  if (!client) {
    console.warn('[twiddlBot] Groq not configured (GROQ_API_KEY is missing) - using static fallback');
    return null;
  }

  const userPrompt = avoid.length > 0
    ? `Write today's question now.

Do not reuse or closely paraphrase any of these questions, which have already appeared on Twiddl:
${avoid.map((text) => `- ${text}`).join('\n')}`
    : "Write today's question now.";

  let lastReason = 'unknown';
  let lastQuestion = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    lastQuestion = '';

    try {
      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        reasoning_effort: 'low',
      });

      const message = completion.choices[0]?.message;
      const content = typeof message?.content === 'string' ? message.content : '';

      if (!content.trim()) {
        lastReason = 'the response was empty';
      } else {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(content);
        } catch {
          lastReason = 'the response was not valid JSON';
        }

        if (parsed !== null) {
          const rawQuestion = typeof (parsed as { question?: unknown }).question === 'string'
            ? collapseWhitespace((parsed as { question: string }).question)
            : '';
          if (rawQuestion) lastQuestion = rawQuestion;

          const validated = validateGeneratedQuestion(parsed, avoid);

          if (!validated.ok) {
            lastReason = `it was rejected (${validated.reason})`;
          } else {
            const selfCheck = await selfCheckQuestion(validated.question);

            if (selfCheck.ok) {
              console.log(`[twiddlBot] Groq-generated question (self-check answered "${selfCheck.answer}"): ${validated.question.text}`);
              return validated.question;
            }

            lastReason = `the self-check failed: ${selfCheck.reason}`;
          }
        }
      }
    } catch (error) {
      const failure = describeGroqFailure(error);
      const retrying = attempt < MAX_ATTEMPTS && failure.retryable;
      console.warn(`[twiddlBot] Groq ${failure.kind} error: ${failure.message} - ${retrying ? 'retrying once' : 'using static fallback'}`);

      if (!retrying) return null;

      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[twiddlBot] Groq attempt ${attempt} was unusable (${lastReason})${lastQuestion ? `: ${lastQuestion.slice(0, 160)}` : ''} - retrying once`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.warn(`[twiddlBot] Groq generation failed after ${MAX_ATTEMPTS} attempts (${lastReason})${lastQuestion ? `: ${lastQuestion.slice(0, 160)}` : ''} - using static fallback`);
  return null;
}