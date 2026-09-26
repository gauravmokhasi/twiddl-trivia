import { GROQ_MODEL, describeGroqFailure, getGroqClient } from '@/lib/groq-client';

export type AiAssistAssessment = 'GOOD' | 'OKAY' | 'NEEDS_REFRAME';

export type AiAssistReview = {
  assessment: AiAssistAssessment;
  suggestedQuestion: string | null;
  shortReason: string | null;
};

const MAX_COMPLETION_TOKENS = 320;
const AI_ASSIST_SYSTEM_PROMPT = `You review Twiddl trivia questions to keep the game fun and fair.

The best trivia questions don't just test what you know. They give the player the thrill of figuring something out.

- Give people a way in. Provide clues or a route to deduction rather than pure recall.
- Connect ideas where it helps, but keep it grounded in real facts.
- Make every clue count and keep the answer fair in hindsight.
- Questions can use logic, wordplay, sequences, images or multi-step reasoning when the format supports it.
- Prefer accessible questions that can be solved through reasoning over obscure fact dumps.

Assess the question and intended answer as follows:
- GOOD: it meaningfully follows the philosophy.
- OKAY: it is a reasonable trivia question, even if imperfect.
- NEEDS_REFRAME: it relies on rote recall, gives no useful route to the answer, is poorly constructed relative to the philosophy, or could clearly become a much better Twiddl question without changing the author's intended subject or answer.

Only return NEEDS_REFRAME when the rewrite would truly improve the question.
When you do return NEEDS_REFRAME, provide exactly one concise rewrite that preserves the intended answer, the subject, and the author's intent.
Do not invent facts, unrelated trivia, or clever-sounding connections.
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

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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
  const safeAnswer = normalizeText(String(correctAnswer ?? ''));
  const safeChoices = Array.isArray(choices) ? choices.map((choice) => normalizeText(String(choice))) : [];
  const safeCorrectIndex = typeof correctAnswerIndex === 'number' ? Math.trunc(correctAnswerIndex) : -1;
  const intendedAnswer = questionType === 'multiple_choice'
    ? (safeCorrectIndex >= 0 && safeCorrectIndex < safeChoices.length ? safeChoices[safeCorrectIndex] : safeAnswer)
    : safeAnswer;

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
