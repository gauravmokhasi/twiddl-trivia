# Apply P1 fixes and correct the Explore tab

This patch is based on your P0 commit `ffeb945` (Protect trivia answer keys and require sign-in for Universe).
No changes have been pushed, deployed, or applied to your live Supabase project by this work.

## What changes

- Profile email remains in the database for server-side account/profile synchronization, but both anonymous and authenticated browser roles lose all SELECT access to it. Safe public profile fields still work under the existing RLS policies.
- “Private” profile labels become “Unlisted.” A visible explanation says unlisted profiles are omitted from Universe but remain reachable by handle. The `is_public` field and product behavior are preserved.
- Postgres locks question creation per author, checks the rolling 24-hour limit after taking the lock, and stores question metadata and its private key in one transaction. Concurrent submissions cannot both pass. Both the early API check and the authoritative database rejection produce the same friendly 403/`alreadyAsked` response.
- Twiddloo uses the same atomic operation; overlapping or slightly early cron calls return its existing question instead of posting twice. It still runs on the existing daily cron and may skip a run if the last question is less than 24 hours old.
- Profile unanswered counts use one aggregate over every question by the author, matching profile-play eligibility. Archive pagination no longer affects “Answer N questions” or “answered all N” text. Guests are no longer mistakenly told they answered everything.
- The Correct stat uses a count-only database query, without downloading answer IDs merely to count them.
- Explore gets the same inactive styling as the other tabs. The current route receives the shared highlight and `aria-current="page"`; nested section routes are handled too. The existing daily-question navigation lock remains in place.

## Step 1: Apply the patch locally

In Windows File Explorer, extract the downloaded zip into:

```text
C:\Users\gomok\twiddl-p1-files
```

Make sure that folder contains `twiddl-p1-updates.patch`. In your project terminal, run these one at a time:

```bash
cd C:/Users/gomok/twiddl
git status
git pull origin main
git apply --check "C:/Users/gomok/twiddl-p1-files/twiddl-p1-updates.patch"
git apply "C:/Users/gomok/twiddl-p1-files/twiddl-p1-updates.patch"
git status --short
```

Save/commit unfinished work before pulling or applying. No output from `git apply --check` means it passed. The final status must show modified and new files. If the check errors because your checkout has later edits, stop and reconcile those edits; don't force the patch over them.

## Step 2: Check the code

Run one at a time:

```bash
npm ci
npm test
npm run lint
npm run build
```

If a check fails, resolve it before production rollout. Don't push yet if Vercel automatically deploys your production branch.

## Step 3: Run the single P1 SQL file in Supabase

P0 must be complete, including its CLEANUP. Do not repeat the old P0 migrations.

1. Have a database backup before changing permissions/functions.
2. Open `sql/202610070003_p1_privacy_and_integrity.sql` from the extracted zip, or the identical file now in `supabase/migrations/` in your project.
3. Open your Twiddl Supabase project → SQL Editor → new query.
4. Copy the ENTIRE file, paste it, and click Run.
5. Wait for success. If it errors, stop and share the message. The file runs in a transaction; it will refuse to run if the legacy P0 key columns are still present.

The existing P0 application can keep calling the writer because its function signature is unchanged. The new profile-count operation must exist before P1 code deploys.

## Step 4: Commit and deploy

Once the migration succeeds, commit all patch files, including the new SQL file and tests. If you are on your normal production branch `main`, run:

```bash
git add .
git commit -m "Protect profile email, enforce atomic daily posting, fix counts and navigation"
git push origin main
```

For another branch, use your normal push/merge workflow into the production branch. Wait for the new Vercel Production deployment to say Ready, or trigger it manually if automatic deployment is disabled.

No new Vercel environment variables are needed. There is NO separate P1 cleanup SQL. Do not run `supabase db push` blindly: the earlier P0 files were manually staged and may not be recorded in the CLI's migration history.

## Step 5: Check the live app

- Sign in and confirm your own profile/account still synchronizes correctly.
- Public profiles load normally. Unlisted profiles stay absent from Universe and remain reachable by handle. Their badge/button/help copy says Unlisted.
- Use a profile with more than 20 questions: compare the remaining count on archive page 1 with page 2. It should be the same. After answering one of their questions, it should decrease by one on reload.
- Check the Correct stat, including an account with zero correct answers.
- In a signed-out/incognito window, Universe must still show the P0 sign-in message without user details.
- Navigate between Feed, Universe, Explore, Notifications and Profile. Explore must lose its highlight when you leave it; the current section should be highlighted instead.
- Create a question with an account eligible to post. Try again inside 24 hours: receive the normal friendly refusal. Both multiple-choice and free-text creation should continue working.
- Verify twiddloo's next scheduled post or a bot answer following a user post still works.

### Optional: verify email permissions in Supabase SQL Editor

Run this read-only query. `table_select` and `email_select` must be `false`; `username_select` must be `true` for both roles:

```sql
select role_name,
  has_table_privilege(role_name, 'public.profiles', 'SELECT') as table_select,
  has_column_privilege(role_name, 'public.profiles', 'email', 'SELECT') as email_select,
  has_column_privilege(role_name, 'public.profiles', 'username', 'SELECT') as username_select
from (values ('anon'), ('authenticated')) as roles(role_name);
```

SQL Editor itself is privileged, so a plain `select email from profiles` there is not a browser-permission test. The service-role key must never be put in browser code.

### Optional: test simultaneous requests in the live app

Use a test account that has NOT posted in the past 24 hours. This test intentionally creates one real question and uses that account's daily allowance. While signed into the production app, open browser developer tools → Console and run:

```javascript
Promise.all([1, 2].map(async () => {
  const response = await fetch('/api/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'Which planet is known as the Red Planet?',
      questionType: 'multiple_choice',
      choices: ['Mars', 'Venus'],
      correctAnswerIndex: 0,
      isPublic: true,
    }),
  });
  return { status: response.status, body: await response.json() };
})).then(console.log);
```

Expect one 200 success and one 403 with `alreadyAsked: true`, in either order. If both are 403, the account was already ineligible. If one is 429, wait for the existing rate-limit window before testing with an eligible account. Don't repeatedly paste the test.

## Validation performed

- All 107 tests pass, including the existing P0 suite.
- New database tests cover email grants, key privacy, the transaction-scoped author lock and its release, queued competing writes, the 24-hour boundary, atomic rollback, and full counts over a 45-question archive.
- PGlite runs one PostgreSQL backend and queues concurrent calls; it does not simulate contention between separate production database connections. The optional live test above checks the complete request flow.
- Lint and TypeScript checks pass.
- Production build was attempted with non-secret placeholder environment values, but this sandbox again could not provide Node's resident-memory system call (`ENOENT: uv_resident_set_memory`). Run the normal build locally/Vercel and perform the live checks above.

Remaining P2 work (follow-request batching, immediate logged-out landing, locked-navigation explanations/account access, and broader contrast improvements) is separate. The requested active-tab fix is included here.
