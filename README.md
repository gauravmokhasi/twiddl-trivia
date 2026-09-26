# Twiddl Trivia

Twiddl Trivia is a social quiz app built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- Email authentication through Supabase Auth
- Username setup with unique profile handles
- Public/private profiles
- Universe directory for public profiles
- Follow and unfollow creators
- A 24-hour feed of questions from followed users
- Multiple-choice and free-text questions with automatic grading
- Fuzzy free-text grading for minor typos, punctuation, capitalization, and aliases
- One answer per user per question
- Profile history, follower/following lists, all-time correct-answer counts, and current Q&A streaks
- Private answer summaries visible only to the question author
- `twiddlBot`, an automated public trivia profile that writes a daily question with Groq and answers questions best-effort (falling back to a static question list when Groq is unavailable)

## Requirements

- Node.js 18.17 or newer
- A Supabase project with email authentication enabled

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and add your Supabase URL, anon key, and service-role key.

3. Run the SQL in [SUPABASE_SETUP.md](SUPABASE_SETUP.md) in the Supabase SQL editor. It creates the tables, indexes, policies, and service-role grants used by the app.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000.

## Useful commands

```bash
npm run dev
npm run build
npm run lint
```

## Environment variables

Never commit `.env.local` or any Supabase service-role key. The service-role key is server-only and must not be exposed through `NEXT_PUBLIC_*` variables. `GROQ_API_KEY` is server-only in the same way: it is read inside `src/lib/groq-client.ts`, which is only ever imported by server code, and the daily question falls back to a static list when the key is absent.

## Deploying to Vercel

1. Push the project to a GitHub repository. Include the source code, `package.json`, `package-lock.json`, configuration files, documentation, `.env.local.example`, and `vercel.json`. Do not commit `.env.local`, `node_modules`, or `.next`.
2. Import the repository at https://vercel.com/new and keep the detected Next.js settings.
3. Add these environment variables in Vercel for Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `GROQ_API_KEY` (server-only; twiddlBot uses it to generate its daily question and falls back to a static list if it is missing or Groq fails)
4. Deploy the project. Vercel will use `vercel.json` to call `/api/cron/twiddl-bot` daily.
5. In Supabase Auth URL Configuration, set the production Site URL to the Vercel URL and add that URL to the Redirect URLs. Keep the localhost URL too for local development.

   The app uses `@supabase/ssr` with Next.js proxy cookie refresh. Do not add the deprecated `@supabase/auth-helpers-*` packages back.

   ## Rotating Supabase secrets

   If a service-role key has ever been shared or committed, rotate it in Supabase first. Then update `SUPABASE_SERVICE_ROLE_KEY` in Vercel under **Project Settings → Environment Variables** for Production and Preview, save, and redeploy. Keep the replacement key out of GitHub and out of any `NEXT_PUBLIC_*` variable.

   The temporary `/api/debug-supabase` endpoint has been removed before deployment.
