export type User = {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  isPublic: boolean;
};

export type Question = {
  id: string;
  authorId: string;
  text: string;
  choices: string[];
  correctAnswerIndex: number;
  createdAt: string;
  isPublic: boolean;
};

export type Answer = {
  id: string;
  questionId: string;
  responderId: string;
  selectedChoiceIndex: number;
  isCorrect: boolean;
  createdAt: string;
};

export const users: User[] = [
  { id: 'u1', username: 'jamie', displayName: 'Jamie', bio: 'Trivia host and storyteller.', isPublic: true },
  { id: 'u2', username: 'maya', displayName: 'Maya', bio: 'Loves science and puzzles.', isPublic: true },
  { id: 'u3', username: 'noah', displayName: 'Noah', bio: 'History buff who asks one question a day.', isPublic: false },
];

export const follows: { followerId: string; followeeId: string }[] = [
  { followerId: 'u1', followeeId: 'u2' },
  { followerId: 'u2', followeeId: 'u1' },
  { followerId: 'u1', followeeId: 'u3' },
];

export const questions: Question[] = [
  {
    id: 'q1',
    authorId: 'u2',
    text: 'Which planet is known as the Red Planet?',
    choices: ['Earth', 'Venus', 'Mars', 'Jupiter'],
    correctAnswerIndex: 2,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    isPublic: true,
  },
  {
    id: 'q2',
    authorId: 'u1',
    text: 'What is the largest ocean on Earth?',
    choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'],
    correctAnswerIndex: 3,
    createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    isPublic: true,
  },
  {
    id: 'q3',
    authorId: 'u3',
    text: 'Which ancient wonder was located in Egypt?',
    choices: ['Great Wall', 'Colossus of Rhodes', 'Lighthouse of Alexandria', 'Statue of Zeus'],
    correctAnswerIndex: 2,
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    isPublic: true,
  },
];

export const answers: Answer[] = [];
