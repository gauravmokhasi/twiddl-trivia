import { isAnswerCorrect } from './answer-checker';
import { MAX_ANSWER_TEXT } from './api-guards';
import type { Database } from './database.types';
import type { PlayableQuestion } from './playable-question';

type QuestionSecret = Database['public']['Tables']['question_secrets']['Row'];
type RecordedAnswer = Pick<Database['public']['Tables']['answers']['Row'],
  'selected_choice_index' | 'answer_text' | 'is_correct'>;

export function validateAnswer(question: Pick<PlayableQuestion, 'question_type' | 'choices'>, selectedChoiceIndex: unknown, answerText: unknown): string | null {
  if (question.question_type === 'multiple_choice') {
    return typeof selectedChoiceIndex === 'number'
      && Number.isInteger(selectedChoiceIndex)
      && selectedChoiceIndex >= 0
      && selectedChoiceIndex < question.choices.length
      ? null : 'Please select one of the answer choices.';
  }
  return typeof answerText === 'string' && answerText.trim().length > 0 && answerText.trim().length <= MAX_ANSWER_TEXT
    ? null : `Please enter an answer (${MAX_ANSWER_TEXT} characters or fewer).`;
}

export function correctAnswerText(question: Pick<PlayableQuestion, 'question_type' | 'choices'>, secret: QuestionSecret): string {
  if (question.question_type === 'free_text') {
    if (!secret.correct_answer?.trim() || secret.correct_answer_index !== null) throw new Error('Invalid free-text answer key.');
    return secret.correct_answer;
  }
  const index = secret.correct_answer_index;
  if (index === null || !Number.isInteger(index) || index < 0 || index >= question.choices.length || secret.correct_answer !== null) {
    throw new Error('Invalid multiple-choice answer key.');
  }
  return question.choices[index];
}

export function gradeAnswer(question: Pick<PlayableQuestion, 'question_type' | 'choices'>, secret: QuestionSecret, selectedChoiceIndex: unknown, answerText: unknown): RecordedAnswer {
  const error = validateAnswer(question, selectedChoiceIndex, answerText);
  if (error) throw new Error(error);
  const correctText = correctAnswerText(question, secret);
  return question.question_type === 'free_text'
    ? { selected_choice_index: null, answer_text: (answerText as string).trim(), is_correct: isAnswerCorrect((answerText as string).trim(), correctText) }
    : { selected_choice_index: selectedChoiceIndex as number, answer_text: null, is_correct: selectedChoiceIndex === secret.correct_answer_index };
}

/** Call only for a persisted answer belonging to the authenticated viewer. */
export function answeredResult(question: Pick<PlayableQuestion, 'question_type' | 'choices'>, secret: QuestionSecret, answer: RecordedAnswer) {
  return {
    hasAnswered: true,
    selectedChoiceIndex: answer.selected_choice_index,
    answerText: answer.answer_text,
    isCorrect: answer.is_correct,
    correctText: correctAnswerText(question, secret),
  };
}
