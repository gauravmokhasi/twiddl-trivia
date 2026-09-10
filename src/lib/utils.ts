import { Question } from './mockData';

export function formatRelativeDate(isoDate: string) {
  const date = new Date(isoDate);
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function isRecentQuestion(question: Question) {
  const createdAt = new Date(question.createdAt).getTime();
  const hoursSince = (Date.now() - createdAt) / (1000 * 60 * 60);
  return hoursSince < 24;
}

export function getFeedQuestions(userId: string, questions: Question[], follows: { followerId: string; followeeId: string }[]) {
  const followees = follows.filter((relation) => relation.followerId === userId).map((relation) => relation.followeeId);
  return questions.filter((question) => followees.includes(question.authorId) && isRecentQuestion(question));
}
