import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getAuthenticatedServerUser } from './auth-server';
import { getDailyQuestionStatus } from './daily-question';
import { isDailyQuestionRouteLocked } from './daily-question-access';

export type DailyQuestionGate = {
  userId: string | null;
  locked: boolean;
};

/**
 * Whether the current visitor still owes today's question and is therefore locked out of the rest of
 * the app. Memoised per request so the header and the page it wraps share a single database query.
 *
 * Signed-out visitors are never locked here, so the existing public and sign-in behaviour is intact.
 */
export const getDailyQuestionGate = cache(async (): Promise<DailyQuestionGate> => {
  const user = await getAuthenticatedServerUser();

  if (!user?.id) {
    return { userId: null, locked: false };
  }

  const { hasAsked, error } = await getDailyQuestionStatus(user.id);

  // Fail open on a database error: a blip should never lock a member out of the whole app.
  if (error) {
    return { userId: user.id, locked: false };
  }

  return { userId: user.id, locked: !hasAsked };
});

/**
 * Guard for every route that is off limits until today's question has been asked. Sends the member
 * back to the feed, which is where the composer lives.
 */
export async function requireAskedToday({ profileOwnerId }: { profileOwnerId?: string } = {}): Promise<void> {
  const { locked, userId } = await getDailyQuestionGate();

  if (isDailyQuestionRouteLocked(locked, userId, profileOwnerId)) {
    redirect('/');
  }
}