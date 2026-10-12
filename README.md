# Twiddl Trivia

Twiddl Trivia is a social quiz app built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- Email authentication through Supabase Auth (magic link)
- Username setup with unique profile handles
- Handles and public names are unique across the app, compared without regard to case, so no two users can look alike
- Public/unlisted profiles: unlisted profiles are omitted from Universe but remain reachable by handle
- Universe directory for public profiles
- Follow and unfollow creators
- A 24-hour feed of questions from followed users
- Multiple-choice and free-text questions with automatic grading
- Fuzzy free-text grading for minor typos, punctuation, capitalization, and aliases
- One answer per user per question
- Profile history, follower/following lists, all-time correct-answer counts, and current Q&A streaks
- Private answer summaries visible only to the question author
- Authors can delete questions they asked in the past, along with the answers and reports attached to them
- Question quality reports: anyone who answered incorrectly can privately flag a question as wrong or ambiguous, and only the author ever sees the count and who reported it (or that it was anonymous)
- `twiddloo`, an automated public trivia profile that writes a daily question with Groq and answers questions best-effort (falling back to a static question list when Groq is unavailable)

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

## PostHog product analytics (optional)

Twiddl ships a small PostHog integration. It is **off unless all three variables are present**, so the app, the tests and the build all work normally with them unset. No Supabase SQL, migration or new table is involved.

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog → **Project settings → Project API key** | The *project ingestion token*, which is safe to expose to the browser. Never a PostHog *personal* API key, and never `SUPABASE_SERVICE_ROLE_KEY`. |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog → **Project settings → Instance address** | `https://us.i.posthog.com` for US Cloud, `https://eu.i.posthog.com` for EU Cloud. |
| `NEXT_PUBLIC_POSTHOG_ENABLED` | You | Must be exactly `true` to capture. Leave unset (or `false`) everywhere except production. |

Because all three are `NEXT_PUBLIC_*`, they are inlined at build time and the browser and server always agree on whether capture is allowed.

**To enable it:** add the three variables in Vercel under *Project Settings → Environment Variables*, scoped to **Production** only, then redeploy. Preview deployments and local development deliberately stay out of the production dataset. To test safely, add the same three variables to a Preview deployment pointing at a **separate** PostHog project.

**Filtering out your own testing account.** Every event is keyed on the Supabase `user.id`, which is also the distinct ID used by `posthog.identify`. To exclude your own activity in PostHog, add an **Exclusion filter** to insights, dashboards and cohorts on the built-in `Distinct ID` property:

- To hide one session: `Distinct ID does not equal <your-supabase-user-id>`
- To hide your account permanently: create a cohort with `Match all events` → `Distinct ID equals <your-supabase-user-id>`, then add that cohort as an exclusion filter on each insight.

Your Supabase user ID is the UUID in *Authentication → Users*. It is not hard-coded anywhere in Twiddl, so excluding it is a PostHog-side configuration step rather than a code change.

What is **not** enabled: feature flags, experiments, surveys, session recording, autocapture (clicks and form submits), and error tracking.

Never send, and never expect to find in PostHog: question text, answer choices, submitted free-text answers, accepted answers or correct-answer indices, emails, names, handles, bios, auth tokens, or raw request bodies.

## Deploying to Vercel

1. Push the project to a GitHub repository. Include the source code, `package.json`, `package-lock.json`, configuration files, documentation, `.env.local.example`, and `vercel.json`. Do not commit `.env.local`, `node_modules`, or `.next`.
2. Import the repository at https://vercel.com/new and keep the detected Next.js settings.
3. Add these environment variables in Vercel for Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `GROQ_API_KEY` (server-only; twiddloo uses it to generate its daily question and falls back to a static list if it is missing or Groq fails)
4. Deploy the project. Vercel will use `vercel.json` to call `/api/cron/twiddloo` daily.
5. In Supabase Auth URL Configuration, set the production Site URL to the Vercel URL and add that URL to the Redirect URLs. Keep the localhost URL too for local development.

   The app uses `@supabase/ssr` with Next.js proxy cookie refresh. Do not add the deprecated `@supabase/auth-helpers-*` packages back.

   ## Rotating Supabase secrets

   If a service-role key has ever been shared or committed, rotate it in Supabase first. Then update `SUPABASE_SERVICE_ROLE_KEY` in Vercel under **Project Settings → Environment Variables** for Production and Preview, save, and redeploy. Keep the replacement key out of GitHub and out of any `NEXT_PUBLIC_*` variable.

   The temporary `/api/debug-supabase` endpoint has been removed before deployment.
