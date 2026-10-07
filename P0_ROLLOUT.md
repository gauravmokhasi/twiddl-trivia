# Apply the P0 fixes and Universe sign-in gate

These repository changes are based on commit `0a40b2615aeedb2e6a9ee8130b0f1b4d27c4f523` of `gauravmokhasi/twiddl-trivia`.
No live Supabase migrations, GitHub push, or Vercel deployment have been performed.

## Apply the patch locally

Unzip the download. From your existing local repository, with a clean working tree:

```bash
git switch -c fix/p0-trivia-trust-boundary
git apply --check /path/to/twiddl-p0-updates.patch
git apply /path/to/twiddl-p0-updates.patch
npm ci
npm test
npm run lint
npm run build
```

Replace `/path/to/` with the folder where you extracted the files. If the check fails because you have changed these files since the base commit, reconcile those changes before applying; do not force it over your work.

The patch contains the application changes, both migration files, tests, and documentation. The separate SQL copies in the download are for easy pasting into Supabase and match the repository migrations.

## Production rollout: PREPARE → deploy → verify → CLEANUP

1. Back up/export the database before changing its schema. Have your existing production environment variables ready; no new ones are needed.
2. **Before pushing to a branch that automatically deploys to Vercel**, open Supabase → SQL Editor and run the entire contents of `supabase/migrations/202610070001_p0_prepare.sql`.
3. Wait for successful SQL execution. If it fails, do not deploy. The migration runs as a transaction; investigate any invalid/missing legacy keys rather than deleting questions to make it pass.
4. Commit and push the application changes, then deploy them to Vercel Production. If you have disabled automatic deployments, trigger the production deployment yourself after PREPARE succeeds.
5. Smoke-test production as described below. PREPARE protects database access immediately, but the old deployed application can still send legacy keys in its page payloads until the new deployment is active. Do not leave that intermediate state as your final release.
6. After the new production deployment passes its checks, return to Supabase → SQL Editor and run the entire contents of `supabase/migrations/202610070002_p0_cleanup.sql`.
7. Repeat the checks after cleanup. Never run both files together, and do not run an unattended `supabase db push` that applies CLEANUP before the application deployment.

PREPARE creates and backfills the private answer-key table, blocks direct browser writes, hides legacy key columns from browser roles, installs a temporary trigger for old server writes, and creates the transactional server-only question operation. New writes temporarily populate the legacy columns as well so old in-flight requests can grade them. CLEANUP verifies every key, removes that trigger and the legacy columns, and replaces the transitional operation with the final implementation.

After CLEANUP, older application versions will no longer work. Roll back only to a version that understands `question_secrets`. The newly created migrations are one-time operations; do not blindly run PREPARE twice.

## Production smoke tests

Use separate author and answering accounts, following the existing rolling daily limit.

- Create a multiple-choice question and a free-text question; check both can be answered and correctly graded.
- Before answering, inspect the question page and feed/explore/profile-play network payloads: they must not contain `correct_answer`, `correct_answer_index`, a secret row, or accepted free-text answers.
- A signed-out or unanswered `GET /api/answers?questionId=...` must return only `hasAnswered: false`. After answering, GET and POST results should include the saved outcome and server-produced `correctText`.
- Reload an answered question: the original saved result is shown and another submission cannot replace it. Concurrent submissions must return the first saved outcome.
- The author still sees their own answer summary. Someone else cannot see it before answering.
- From a browser-role Supabase client, reading `question_secrets`, reading the legacy key columns during PREPARE, writing questions/answers, updating `is_correct`, and calling `create_question_with_secret` must all fail. Test this using the anon key/session JWT, not the service-role key or SQL Editor's privileged connection.
- Verify twiddloo's next question/answer operation still works, using the existing protected cron configuration or after a user posts a question.
- In a private/incognito window with no login, visit `/universe` and `/universe?page=2`. See only “Sign in to see the full list of public users on the app.” and the sign-in link. No names, handles, bios, profile links, lookup box, count, or pagination are fetched or rendered by this page.
- Signed-in Universe remains available under its existing daily-question gate.

## Validation performed in this workspace

- `npm test`: 94 passing tests, including PostgreSQL/PGlite integration tests for browser permissions, both question types, legacy/new writes during PREPARE, transactional rollback, cleanup refusal when a key is missing, post-cleanup operation, participant-only answer reads, and cascading deletion.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build` and the webpack fallback were attempted with non-secret placeholder environment values. Both stopped because this execution sandbox cannot provide Node's resident-memory system call (`ENOENT: uv_resident_set_memory`). Run the normal build locally/Vercel; a completed production build and live smoke tests have not been verified here.

PGlite is a development-only dependency. The test command uses Node's test runner with the existing tsx loader, avoiding the tsx CLI's temporary IPC socket.

## Scope and remaining work

This implements the two P0 issues in the earlier P0 prompt: answer-key exposure and direct writes that bypass server validation/grading. It also adds the requested server-side Universe sign-in gate. It does not rewrite previously stored answers or undo historical exposure.

P1/P2 work remains separate, including profile email permissions, the atomic rolling daily limit, counts, unlisted terminology, follow-request batching, and broader UX fixes. The Universe change restricts the directory page; it does not change the existing public-profile database policies or the public individual-profile/handle-lookup product behavior.
