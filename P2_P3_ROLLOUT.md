# Apply P2 (private blocking)

This document covers the migration in `supabase/migrations/` that ships after
P1. Nothing here has been pushed, deployed, or applied to your live Supabase
project by this work.

| Migration | File | Apply before |
| --- | --- | --- |
| P2 | `202610090001_p2_user_blocks.sql` | deploying the blocking code |

P1 must already be complete, including its CLEANUP. Do not re-run the old P0
migrations.

## What P2 changes

- A new `public.user_blocks` table. One row means "blocker_id has blocked
  blocked_id". Self-blocking is refused by a check constraint.
- Row level security on that table: a signed-in user may read, create and
  delete only their own blocks. There is no UPDATE policy, so a block is
  immutable apart from being deleted. `anon` has no grant at all.
- Two `security definer` triggers that enforce the block on `follows`:
  - A trigger on `user_blocks`: inserting a block deletes the follow the
    blocked user had on the blocker.
  - A trigger on `follows`: a blocked user can never insert or update a follow
    onto the blocker. The error is deliberately uninformative ("follow
    refused").
- Unblocking deliberately does **not** restore the follow. There is no trigger
  on delete, so the follow is gone for good.
- A `security definer` helper `public.is_blocked_from(uuid)` plus a rewritten
  "Questions are readable" policy. A question whose author has blocked the
  viewer is no longer returned to that viewer by PostgREST, so the block also
  holds for a browser using the anon key directly.

## Step 1: Check the code

```bash
cd C:/Users/gomok/twiddl
npm ci
npm test
npm run lint
npm run build
```

All four must pass before you touch the database. `npm test` covers the P2
schema against a real Postgres (PGlite), including the permission checks
below.

## Step 2: Apply P2 (blocking)

1. Take a database backup first.
2. Open `supabase/migrations/202610090001_p2_user_blocks.sql`.
3. Supabase project -> SQL Editor -> New query.
4. Copy the ENTIRE file, paste it, and click Run.
5. Wait for success. The file runs in one transaction, so a failure rolls the
   whole file back and leaves the database as it was.

## Step 3: Set the environment

Copy `.env.local.example` to `.env.local` and fill it in. The ones you need,
all server-side:

## Step 4: Smoke-test the blocking behavior

Use two accounts, A and B, both signed in as normal users.

1. B follows A. Confirm the follow is visible on A's followers list.
2. A blocks B.
3. Reload A's profile as B.
   - The follow is gone. The block trigger removed it.
   - A's questions no longer appear in B's feed. The rewritten "Questions
     are readable" policy hides them.
4. B tries to follow A again.
   - The insert is refused with "follow refused". The error says nothing
     about the block.
5. B tries to open A's question directly.
   - It is not returned.
6. A unblocks B.
   - The follow is NOT restored. Unblocking is one-way; the user must follow
     again explicitly.

## Step 6: Check the permissions

Run these in the SQL Editor. Every one must return the expected result.

```sql
-- 1. The block table exists with RLS on.
select relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.user_blocks'::regclass;
-- expect: t | f  (RLS is enabled; it is not FORCEd, so the table owner and
-- the service role bypass it, which is what we want)

-- 2. anon has no grant on the block table.
select has_table_privilege('anon', 'public.user_blocks', 'select') as anon_select;
-- expect: f

-- 3. Browser roles cannot read the send bookkeeping.
select has_table_privilege('anon', 'public.reengagement_sends', 'select') as anon_select,
       has_table_privilege('authenticated', 'public.reengagement_sends', 'select') as auth_select;
-- expect: f | f

-- 4. Browser roles cannot call the server-only functions.
select has_function_privilege('anon', 'public.reengagement_candidates(integer, integer)', 'execute') as anon_call,
       has_function_privilege('authenticated', 'public.claim_reengagement_send(uuid, timestamptz, uuid, text, text)', 'execute') as auth_call;
-- expect: f | f

-- 5. The service role can.
select has_function_privilege('service_role', 'public.reengagement_candidates(integer, integer)', 'execute') as svc_call;
-- expect: t

-- 6. Consent defaults to off for every profile.
select count(*) as enabled from public.profiles where reengagement_emails_enabled;
-- expect: 0
```

## Step 7: Smoke-test the re-engagement email

Use a throwaway account, and keep the caps low so a mistake cannot email
many people. Set `REENGAGEMENT_MAX_SENDS=1` and
`REENGAGEMENT_MAX_CANDIDATES=5` in `.env.local` while you test.

1. Sign in as the test account and open your profile.
2. Turn on **Re-engagement emails** under the profile. The page should say
   "Re-engagement emails are on."
3. Confirm in SQL that consent is stored:

   ```sql
   select id, reengagement_emails_enabled, last_active_at
   from public.profiles where id = '<test-user-id>';
   ```

4. Backdate the account so it looks inactive:

   ```sql
   update public.profiles
   set last_active_at = now() - interval '3 days'
   where id = '<test-user-id>';
   ```

5. Trigger the daily job by hand:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.example/api/cron/twiddloo
   ```

   The response includes a `reengagement` object:

   ```json
   { "status": "sent", "reason": "..." }
   ```

6. Check your inbox. Exactly one email arrives, with one question and two
   links: a sign-in link and an unsubscribe link.
7. Open the sign-in link. It lands on `/auth/callback`, signs you in, and takes
   you to the question the email offered.
8. Open the unsubscribe link. The page shows a confirmation and posts to
   `/api/unsubscribe`; after that the preference is off.
9. Run the cron endpoint again.
   - Exactly one email arrives. The claim row already exists, so the second
     run skips that user. No second email.

## Step 8: Check the send log

```sql
select user_id, inactive_since, status, sent_at, failed_at, error
from public.reengagement_sends order by created_at desc limit 20;
```

- One row per (user, inactivity period). The primary key is what prevents a
  duplicate.
- `status` is `sending` while the message is in flight, `sent` once the
  provider accepted it, and `failed` if it did not.
- A `failed` row is still eligible on the next run, so a provider outage does
  not permanently lose a user.
- `link_hash` and `unsubscribe_hash` are SHA-256 hashes. The raw tokens exist
  only in the email itself.

## Step 9: Configure Supabase and Brevo

### Supabase Auth

Supabase project -> Authentication -> URL Configuration:

- **Site URL**: `https://your-domain.example`
- **Redirect URLs**: add `https://your-domain.example/auth/callback`

The sign-in link in the email goes through `/auth/callback`, so it must be
listed as an allowed redirect or Supabase refuses to complete the sign-in.

### Brevo

1. Brevo -> SMTP & API -> API Keys -> create a key.
2. Set it as `BREVO_API_KEY`. This is a different key from the one Supabase
   Auth uses as its SMTP relay; Supabase's SMTP settings are not touched.
3. Make sure `BREVO_SENDER_EMAIL` is an address Brevo has already verified.
   The Supabase Auth sender address is normally verified already, so reusing
   it is the simplest option.

## Step 10: Confirm the cron schedule

`vercel.json` already schedules the job; it does not need changing:

```json
{
  "crons": [
    {
      "path": "/api/cron/twiddloo",
      "schedule": "0 0 * * *"
    }
  ]
}
```

## When something fails

| Symptom | Cause | What to do |
| --- | --- | --- |
| Cron returns 401 | `CRON_SECRET` is missing or wrong | Set the same value in Vercel and in the cron client. |
| The daily trivia job fails | A real bug in the trivia path | This is not related to email; check the cron logs. |

## Rolling back

Both migrations are additive, so a rollback is rarely needed. If it is:

```sql
-- P2
drop trigger if exists user_blocks_remove_follows on public.user_blocks;
drop trigger if exists follows_refuse_blocked on public.follows;
drop function if exists public.refuse_blocked_follow();
drop function if exists public.remove_follows_on_block();
drop function if exists public.is_blocked_from(uuid);
drop table if exists public.user_blocks;
```

Dropping the P2 block table also removes the block behaviour, because the
triggers and the rewritten policy depend on it. Restore the P1 policy for
"Questions are readable" if you drop P2.

## What this work did and did not do

Done:

- The P2 migration file and the code that uses it are written and tested
  locally, including the permission checks against a real Postgres.
- This document, and `SUPABASE_SETUP.md` alongside it.

Not done, and still yours to do:

- Applying P2 to any live or staging Supabase project.
- Deploying to Vercel and letting the cron run for real.

