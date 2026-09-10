# Twiddl Trivia App Map

## Main routes

- `/` - 24-hour feed of questions from followed users
- `/login` - Supabase email authentication
- `/ask` - Create a multiple-choice or free-text question
- `/universe` - Discover public profiles
- `/profile` - Redirect to the signed-in user's profile or request a username
- `/profile/[username]` - Profile, privacy control, history, followers, following, and correct-answer count
- `/questions/[id]` - Question details, answer form, fuzzy free-text grading, and author-only answer summary

## API routes

- `/api/auth` - Authentication support
- `/api/profile-sync` - Create or preserve the signed-in user's profile
- `/api/username` - Validate and save a unique username
- `/api/profile-visibility` - Toggle profile visibility
- `/api/follow` - Follow and unfollow users
- `/api/follow/status` - Read the current follow state
- `/api/questions` - Create questions
- `/api/answers` - Read or submit one answer per user per question
- `/api/cron/twiddl-bot` - Daily twiddlBot question and relationship job

## Supabase helpers

- `src/lib/supabase-client.ts` - Browser client
- `src/lib/supabase-server.ts` - Session-aware server and route clients
- `src/lib/supabase-admin.ts` - Server-only service-role client
- `src/lib/database.types.ts` - Database TypeScript definitions
