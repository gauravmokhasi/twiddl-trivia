export type ChoicePayload = {
  choices: string[];
  correctAnswerIndex: number;
};

/**
 * Drops blank choice rows and keeps the ticked option pointing at itself.
 *
 * The composer allows empty rows, and those rows were previously filtered out while the selection
 * index was left untouched. Any blank row before the ticked one therefore shifted every later
 * option down, so the index referred to a different choice than the author picked. That made the
 * stored correct answer wrong and fed the AI assist review the wrong intended answer.
 */
export function buildChoicePayload(choices: string[], selectedIndex: number): ChoicePayload {
  const kept: string[] = [];
  let correctAnswerIndex = -1;

  choices.forEach((choice, index) => {
    const trimmed = choice.trim();
    if (!trimmed) return;

    if (index === selectedIndex) correctAnswerIndex = kept.length;
    kept.push(trimmed);
  });

  return { choices: kept, correctAnswerIndex };
}