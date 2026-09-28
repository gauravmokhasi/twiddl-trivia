/**
 * Single source of truth for Twiddl's question guidance, written in plain English.
 *
 * Edit this file and all four places follow:
 *   1. the guide page at /how-to-write-a-question
 *   2. the compact "What makes a good question" panel above the composer
 *   3. twiddlBot's question generator prompt
 *   4. the AI assist reviewer prompt
 */

export type GuidancePrinciple = {
  title: string;
  /** Long form, used on the guide page. */
  body: string;
  /** One-line form, used in the compact composer panel. */
  short: string;
  /** Show this principle in the compact panel above the composer. */
  showInComposer: boolean;
};

export const GUIDANCE_INTRO = "The best trivia questions don't just test what you know. They give the player the thrill of figuring something out.";

export const GUIDANCE_PROMISE = "A great question makes you curious, gets you thinking, and rewards you with that wonderful moment when everything clicks. Here's how to write one.";

export const GUIDANCE_PRINCIPLES: GuidancePrinciple[] = [
  {
    title: 'Give people a way in.',
    body: "Don't just ask for a fact. Offer clues that help someone work towards the answer, even if they've never heard it before. A good question gives everyone a fighting chance, not just the person with the best memory.",
    short: 'Offer clues, not just a fact, so everyone has a fighting chance.',
    showInComposer: true,
  },
  {
    title: 'Connect the unexpected.',
    body: 'Link a musician to a scientific discovery, a historical event to a modern brand, or two seemingly unrelated clues to a surprising third answer. The more satisfying the connection, the more memorable the question.',
    short: 'Link two unlikely ideas to a surprising third answer.',
    showInComposer: false,
  },
  {
    title: 'Make every clue count.',
    body: 'Each clue should bring someone closer to the answer. A clever twist might make them reconsider their first guess, but the solution should always feel fair and obvious in hindsight.',
    short: 'Each clue should bring them closer to the answer.',
    showInComposer: true,
  },
  {
    title: 'Keep it to two steps.',
    body: 'One clue, or two clues that work together, is the target. Wordplay, riddles and sequences are all welcome, but always in the simplest structure that carries the idea. A third clue adds no charm and one more chance to be inaccurate.',
    short: 'One clue, or two that work together. Skip the third.',
    showInComposer: false,
  },
  {
    title: 'Make solving more fun than knowing.',
    body: "A question that most people can work out can be far more enjoyable than one that only a handful of experts can answer. The goal isn't to stump everyone. It's to give them the satisfaction of getting there.",
    short: "The goal isn't to stump everyone, it's the satisfaction of the click.",
    showInComposer: true,
  },
];

/**
 * The rules that sit underneath the principles. Used verbatim in both model prompts, so the bot
 * writes questions by the same standard the AI assist reviewer applies.
 */
export const GUIDANCE_RULES = [
  'Use at most two clues, and prefer two that work together over one plus padding. Every extra clue is another chance to be inaccurate, and it makes the question feel contrived.',
  'If an idea needs three clauses to work, it is too complicated. Pick a simpler idea instead.',
  'Use only clues you are certain are true, and that a curious player could check for themselves.',
  'Every clue must be factually consistent with the answer, and a player who knows the answer should be able to explain why each clue fits.',
  'Never build a question on a coincidence, a title match, a shared name, a "sounds like", or an "also the name of" claim unless it is a famous, easily verified fact.',
  'Prefer familiar or reasonably accessible answers approached in an interesting way over obscure ones.',
  'Avoid simple rote recall such as a bare "Who was...?", "What year...?", "What is the capital...?", "Where was X born?" or "What is the largest...?", unless the construction provides a genuinely interesting route to the answer.',
  'Do not fabricate connections to make a question seem clever.',
  'Produce exactly one intended answer, and never write the answer or an accepted form of it inside the question.',
  'Prefer well-documented subjects (science, geography, history, language, arts) over niche or very recent pop culture.',
  'Keep the question concise: one or two sentences, under 320 characters, and suitable for a mobile app.',
];

export const GUIDANCE_EXAMPLE = {
  note: "We've deliberately kept this one easy to show how a few connected clues can make even a familiar answer fun.",
  text: 'This scientist shares his surname with the SI unit of force. His work helped explain why planets orbit the Sun, and a famous story about a falling apple is associated with his discovery of gravity.',
  prompt: 'Who is he?',
  answer: 'Isaac Newton',
};

/** The JSON shape both prompts ask for, described in English for json_object mode. */
export const QUESTION_OUTPUT_INSTRUCTIONS = `Reply with a single JSON object, and nothing else, using exactly these keys:
- "question": the question text, one or two sentences, under 320 characters.
- "answer": the single intended answer, kept short.
- "acceptedAnswers": up to 4 other acceptable forms of the answer, such as a surname alone or an alternative spelling. Never include commas or semicolons.
- "questionType": either "free_text" or "multiple_choice". Prefer "free_text".
- "choices": an empty array for free text, or 3 to 4 short options for multiple choice.
- "correctChoiceIndex": the index of the correct option for multiple choice, or -1 for free text.`;

/** The principles rendered as a plain-English brief, with an optional worked example. */
export function buildGuidanceBrief(options: { includeRules?: boolean; includeExample?: boolean } = {}) {
  const sections = [
    GUIDANCE_INTRO,
    GUIDANCE_PRINCIPLES.map((principle) => `- ${principle.title} ${principle.body}`).join('\n'),
  ];

  if (options.includeRules !== false) {
    sections.push(`Rules:\n${GUIDANCE_RULES.map((rule) => `- ${rule}`).join('\n')}`);
  }

  if (options.includeExample) {
    sections.push(`The shape we want, worked through:\n${GUIDANCE_EXAMPLE.text} ${GUIDANCE_EXAMPLE.prompt} (answer: ${GUIDANCE_EXAMPLE.answer})`);
  }

  return sections.join('\n\n');
}