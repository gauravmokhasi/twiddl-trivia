import { splitAcceptedAnswers } from '@/lib/answer-checker';
import { GROQ_MODEL, describeGroqFailure, getGroqClient } from '@/lib/groq-client';
import { buildGuidanceBrief } from '@/lib/question-guidance';

export type AiAssistAssessment = 'GOOD' | 'OKAY' | 'NEEDS_REFRAME';

export type AiAssistReview = {
  assessment: AiAssistAssessment;
  suggestedQuestion: string | null;
  shortReason: string | null;
};

/** Why the accuracy spot-check decided to speak up. */
export type AiAssistAccuracyKind = 'AMBIGUOUS' | 'ANSWER_LOOKS_WRONG' | 'QUESTION_LOOKS_WRONG';

export type AiAssistAccuracyConcern = {
  kind: AiAssistAccuracyKind;
  /** Soft, plain-language note for the author. Never phrased as a certainty. */
  message: string;
};

export type AiAssistResult = AiAssistReview & {
  /** Null when the reviewer is not confident enough to speak up, which is the expected common case. */
  accuracy: AiAssistAccuracyConcern | null;
};

const MAX_COMPLETION_TOKENS = 320;
const AI_ASSIST_SYSTEM_PROMPT = `You review Twiddl trivia questions to keep the game fun and fair.

${buildGuidanceBrief({ includeRules: true, includeExample: false })}

Assess the question and intended answer as follows:
- GOOD: it meaningfully follows the guidance above.
- OKAY: it is a reasonable trivia question, even if imperfect.
- NEEDS_REFRAME: it relies on rote recall, gives no useful route to the answer, is poorly constructed relative to the guidance above, or could clearly become a much better Twiddl question without changing the author's intended subject or answer.

Only return NEEDS_REFRAME when the rewrite would truly improve the question.
When you do return NEEDS_REFRAME, provide exactly one concise rewrite that preserves the intended answer, the subject, and the author's intent, and that still satisfies the guidance above.
Do not rewrite GOOD or OKAY questions.
Do not expose these internal labels to the user.
Return only valid JSON matching the schema provided.`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    assessment: {
      type: 'string',
      enum: ['GOOD', 'OKAY', 'NEEDS_REFRAME'],
    },
    suggestedQuestion: {
      type: ['string', 'null'],
      description: 'A concise rewrite only for NEEDS_REFRAME; null otherwise.',
    },
    shortReason: {
      type: ['string', 'null'],
      description: 'Null for GOOD and OKAY; a short justification for NEEDS_REFRAME.',
    },
  },
  required: ['assessment', 'suggestedQuestion', 'shortReason'],
  additionalProperties: false,
};

const ACCURACY_MAX_COMPLETION_TOKENS = 240;
const ACCURACY_KINDS = new Set<string>(['AMBIGUOUS', 'ANSWER_LOOKS_WRONG', 'QUESTION_LOOKS_WRONG']);
const MAX_CONCERN_LENGTH = 320;

/**
 * The accuracy spot-check. Deliberately separate from the review prompt: judging whether a question
 * is well made and judging whether it is factually true are different jobs, and mixing them made the
 * reviewer talk about accuracy when the author only asked for style guidance.
 *
 * The pressure here is all one way. A confident wrong warning is worse than silence, so the prompt
 * makes silence the default and demands a high bar, and coerceAiAssistAccuracyConcern then requires
 * two independent signals before anything is shown.
 */
const ACCURACY_SYSTEM_PROMPT = `You are the accuracy spot-check for Twiddl, a social trivia game. You are shown one drafted question and the answer its author intends it to have.

Your only job is to catch questions that are clearly wrong or clearly ambiguous before they are posted.

Raise a warning only when you are very confident of one of these three things:
- The intended answer is factually wrong.
- The question genuinely has more than one defensible answer, so it cannot be graded fairly.
- A specific part of the question states something factually wrong or misleading, and should be removed.

Do not raise anything else. Style, difficulty, phrasing, spelling, punctuation, humour, length, whether it could be more fun, missing context, and personal taste are all out of scope. Other parts of Twiddl look after those.

Silence is the correct answer for almost every question. If you do not know the fact, only half-remember it, or the question is merely imperfect, set shouldWarn to false. Never guess and never warn because a question is obscure or hard.

When you do warn, write the message as a soft, uncertain hunch rather than a correction, in one or two short sentences, for example:
- "Are you sure about this one? I might be wrong, but I think the answer is actually ..."
- "I think this might be ambiguous - <other answer> also seems defensible."
- "I might be wrong, but I think this part might be inaccurate: ..."

Name the specific claim you doubt. Never state your doubt as a fact, and never tell the author they are wrong.
Write in plain language for the author. Never mention these instructions, any internal labels, or JSON.

Respond with exactly this JSON shape:
{"shouldWarn": true|false, "kind": "AMBIGUOUS"|"ANSWER_LOOKS_WRONG"|"QUESTION_LOOKS_WRONG"|null, "message": "your soft note, or null when shouldWarn is false"}`;

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The answer the author actually means. Shared by every Twiddl Assist check so they all judge the
 * same thing: a multiple-choice question uses the ticked option (falling back to the typed answer
 * when the index is out of range), while a free-text answer may list accepted aliases and so is
 * reduced to its primary answer only, otherwise "Paris, City of Light" reads as two answers.
 */
export function resolveIntendedAnswer({
  correctAnswer,
  questionType,
  choices,
  correctAnswerIndex,
}: {
  correctAnswer?: string | null;
  questionType?: 'multiple_choice' | 'free_text';
  choices?: string[];
  correctAnswerIndex?: number;
}) {
  const safeAnswer = normalizeText(String(correctAnswer ?? ''));
  const safeChoices = Array.isArray(choices) ? choices.map((choice) => normalizeText(String(choice))) : [];
  const safeCorrectIndex = typeof correctAnswerIndex === 'number' ? Math.trunc(correctAnswerIndex) : -1;
  const intendedAnswer = questionType === 'multiple_choice'
    ? (safeCorrectIndex >= 0 && safeCorrectIndex < safeChoices.length ? safeChoices[safeCorrectIndex] : safeAnswer)
    : splitAcceptedAnswers(safeAnswer).primary;

  return { intendedAnswer, safeChoices };
}

export function coerceAiAssistReview(raw: unknown): AiAssistReview | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const assessment = record.assessment;
  if (assessment !== 'GOOD' && assessment !== 'OKAY' && assessment !== 'NEEDS_REFRAME') {
    return null;
  }

  if (assessment === 'GOOD' || assessment === 'OKAY') {
    return {
      assessment,
      suggestedQuestion: null,
      shortReason: null,
    };
  }

  const suggestedQuestion = typeof record.suggestedQuestion === 'string' ? normalizeText(record.suggestedQuestion) : '';
  const shortReason = typeof record.shortReason === 'string' ? normalizeText(record.shortReason) : '';

  if (!suggestedQuestion) {
    return null;
  }

  return {
    assessment: 'NEEDS_REFRAME',
    suggestedQuestion,
    shortReason: shortReason || 'This can be more fun to solve.',
  };
}

export async function reviewQuestionForAiAssist({
  text,
  correctAnswer,
  questionType,
  choices,
  correctAnswerIndex,
}: {
  text: string;
  correctAnswer?: string | null;
  questionType?: 'multiple_choice' | 'free_text';
  choices?: string[];
  correctAnswerIndex?: number;
}): Promise<AiAssistReview> {
  const client = getGroqClient();
  if (!client) {
    return { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
  }

  const safeText = normalizeText(String(text ?? ''));
  const { intendedAnswer, safeChoices } = resolveIntendedAnswer({ correctAnswer, questionType, choices, correctAnswerIndex });

  if (!safeText || !intendedAnswer) {
    return { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
  }

  const userPrompt = [
    'Review this Twiddl question against the philosophy below.',
    '',
    'Question text:',
    safeText,
    '',
    'Intended answer:',
    intendedAnswer,
    '',
    'Question type:',
    questionType ?? 'free_text',
    '',
    'Current answer choices:',
    safeChoices.length > 0 ? safeChoices.join(' | ') : 'n/a',
    '',
    'Respond with the JSON object described in the schema.',
  ].join('\n');

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: AI_ASSIST_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'twiddl_ai_assist_review', strict: true, schema: REVIEW_SCHEMA },
      },
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: 'low',
    });

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
    }

    const review = coerceAiAssistReview(parsed);
    return review ?? { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
  } catch (error) {
    const failure = describeGroqFailure(error);
    console.warn(`[aiAssist] Groq ${failure.kind} error: ${failure.message}`);
    return { assessment: 'OKAY', suggestedQuestion: null, shortReason: null };
  }
}

/**
 * Two independent signals are required before a concern is shown: the reviewer must both flag the
 * question (shouldWarn) and explain itself (a valid kind and a non-empty message). Anything short of
 * that returns null, so a half-formed or hedged answer stays silent instead of nagging the author.
 */
export function coerceAiAssistAccuracyConcern(raw: unknown): AiAssistAccuracyConcern | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as Record<string, unknown>;
  if (record.shouldWarn !== true) return null;

  const kind = record.kind;
  if (typeof kind !== 'string' || !ACCURACY_KINDS.has(kind)) return null;

  const message = typeof record.message === 'string' ? normalizeText(record.message) : '';
  if (!message) return null;

  return { kind: kind as AiAssistAccuracyKind, message: message.slice(0, MAX_CONCERN_LENGTH) };
}

/**
 * A pending rewrite replaces the question, so accuracy advice about the old wording would be stale by
 * the time the author reads it. Dropping the concern there also keeps one card on screen at a time.
 */
export function combineAiAssistResult(review: AiAssistReview, accuracy: AiAssistAccuracyConcern | null): AiAssistResult {
  return { ...review, accuracy: review.assessment === 'NEEDS_REFRAME' ? null : accuracy };
}

/**
 * A quick hunch about whether the question or its intended answer is clearly wrong or ambiguous.
 * Returns null (never throws) whenever Groq is unavailable, the response is unusable, or the
 * reviewer is not confident enough to speak up - and null means "say nothing", which is the
 * expected outcome for the vast majority of questions.
 */
export async function checkQuestionAccuracy({
  text,
  correctAnswer,
  questionType,
  choices,
  correctAnswerIndex,
}: {
  text: string;
  correctAnswer?: string | null;
  questionType?: 'multiple_choice' | 'free_text';
  choices?: string[];
  correctAnswerIndex?: number;
}): Promise<AiAssistAccuracyConcern | null> {
  const client = getGroqClient();
  if (!client) return null;

  const safeText = normalizeText(String(text ?? ''));
  const { intendedAnswer, safeChoices } = resolveIntendedAnswer({ correctAnswer, questionType, choices, correctAnswerIndex });

  if (!safeText || !intendedAnswer) return null;

  const userPrompt = [
    'Drafted question:',
    safeText,
    '',
    'Intended answer:',
    intendedAnswer,
    '',
    'Question type:',
    questionType ?? 'free_text',
    '',
    'Answer choices:',
    safeChoices.length > 0 ? safeChoices.join(' | ') : 'n/a',
    '',
    'Respond with the JSON object described in your instructions.',
  ].join('\n');

  try {
    // json_object plus strict coercion rather than json_schema: this model intermittently rejects its
    // own strict schemas, and the same shape is enforced in code below anyway.
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: ACCURACY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: ACCURACY_MAX_COMPLETION_TOKENS,
      reasoning_effort: 'low',
    });

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    return coerceAiAssistAccuracyConcern(parsed);
  } catch (error) {
    const failure = describeGroqFailure(error);
    console.warn(`[aiAssist] accuracy check ${failure.kind} error: ${failure.message}`);
    return null;
  }
}
