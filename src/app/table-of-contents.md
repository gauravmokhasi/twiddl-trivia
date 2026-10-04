# Twiddl Trivia App Map

## Main routes

- `/` - 24-hour feed of questions from followed users
- `/login` - Supabase email authentication
- `/ask` - Create a multiple-choice or free-text question
- `/universe` - Discover public profiles
- `/profile` - Redirect to the signed-in user's profile or request a username
- `/profile/[username]` - Profile, privacy control, history, followers, following, and correct-answer count, plus delete controls on your own past questions
- `/questions/[id]` - Question details, answer form, fuzzy free-text grading, author-only answer summary, author-only question-quality reports, and an author delete control

## Question quality reports

- `src/lib/question-reports.ts` - Report reasons, reason labels, and the author-facing summary rules
- `src/lib/question-reports-server.ts` - Author-only read of a question's reports, tolerant of a missing table
- `src/components/QuestionReportPrompt.tsx` - The understated prompt shown only after an incorrect answer
- Reports are private: only the question's author ever sees them, never publicly, and they can be sent anonymously
- The table is service-role only, so it has row-level security enabled and no policies at all

## twiddloo

- `src/lib/twiddloo.ts` - The automated profile: its seed row, its daily question, and its best-effort answers
- `src/lib/twiddloo-question-generator.ts` - Groq question generation with a static fallback
- `/api/cron/twiddloo` - Daily job that writes twiddloo's question and re-follows every user
- The profile is seeded with the id `00000000-0000-4000-8000-000000000001`, the handle `twiddloo`, and the public name `twiddloo`
- It was called `twiddlBot` before; SUPABASE_SETUP.md carries the one-line migration for existing databases

## Profile identity

- `src/lib/profile-identity.ts` - Normalising and comparing handles and public names, plus recognising the database's rejection of a duplicate
- `src/lib/profile-identity-server.ts` - Friendly pre-check used by `/api/username` and `/api/profile`
- A handle and a public name share one namespace and are compared without regard to case, so no two users can claim the same either way
- The database is the authority: the `profiles_identity_unique` trigger plus the `profiles_username_lower_key` index, so a race cannot slip a duplicate through

## Deleting your own questions

- `src/lib/question-deletion.ts` - The rule: the author only, and not while the question is still today's
- `src/components/DeleteQuestionButton.tsx` - Two-tap delete control, used by the profile archive and the question page
- Answers and quality reports are removed with their question through `on delete cascade`


## API routes

- `/api/auth` - Authentication support
- `/api/profile-sync` - Create or preserve the signed-in user's profile
- `/api/username` - Validate and save a unique username, checked against every handle and public name
- `/api/profile-visibility` - Toggle profile visibility
- `/api/follow` - Follow and unfollow users
- `/api/follow/status` - Read the current follow state
- `/api/questions` - Create questions, and delete your own once they are a day old
- `/api/answers` - Read or submit one answer per user per question
- `/api/question-reports` - Record a quality report from someone who answered a question incorrectly
- `/api/cron/twiddloo` - Daily twiddloo question and relationship job

## Daily question rule

- `src/lib/daily-question.ts` - The one-question-per-24-hours rule
- `src/lib/daily-question-gate.ts` - Until today's question is asked, `/universe`, `/explore`, `/profile`, `/profile/[username]`, and `/questions/[id]` bounce back to `/`, and the header links render inert. Signed-out visitors are unaffected.
- `src/components/NavLinks.tsx` - Header navigation that respects the lock

## Supabase helpers

- `src/lib/supabase-client.ts` - Browser client
- `src/lib/supabase-server.ts` - Session-aware server and route clients
- `src/lib/supabase-admin.ts` - Server-only service-role client
- `src/lib/database.types.ts` - Database TypeScript definitions
