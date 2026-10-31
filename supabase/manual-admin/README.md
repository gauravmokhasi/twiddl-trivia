# Manual admin operations

Database/administrative operations for maintaining Twiddl. **None of these are
features** — nothing here is reachable from the app, no API route exposes them,
and ordinary Twiddl users cannot perform any of them.

Run everything by hand, review before you execute, and never commit secrets.

| File | Operation | Reversible? |
| --- | --- | --- |
| `unlist_profiles.sql` | Set `profiles.is_public = false` for chosen profiles | **Yes** |
| `delete_profiles.sql` | Delete chosen `public.profiles` rows (cascades) | **No** |
| `delete_auth_accounts.ts` | Delete chosen Supabase Auth accounts via the Admin API | **No** |

---

## The three operations are not the same thing

**Unlisting** flips one boolean. The account, the profile, and all of their data
survive. The profile drops out of Universe and out of Explore for people who do
not already follow it, but stays reachable at `/profile/<username>`.

**Deleting a profile row** removes the `public.profiles` row plus everything
that cascades off it. It does **not** delete the Supabase Auth account — there
is no foreign key between `public.profiles.id` and `auth.users`, and no trigger
on `auth.users`. The person can sign in again, and
`src/app/api/profile-sync/route.ts` will recreate their profile row on the next
visit.

**Deleting an auth account** removes the login, sessions and identities. It does
**not** touch `public.profiles` or any question, answer or follow.

### Complete removal of a person

Do it in this order — the reverse order is the one that fails:

1. `npx tsx supabase/manual-admin/delete_auth_accounts.ts --apply <uuid> …`
   (auth account first, so they cannot sign in and re-sync)
2. `delete_profiles.sql` (removes the orphaned profile row and its data)

---

## Safety rules that apply to all of them

- Every destructive statement only ever matches an **explicit list of UUIDs**.
  An empty list matches zero rows, so nothing can widen to "all profiles" or
  "all users".
- Nothing is identified by display name. Names/emails appear only as read-only
  context so you can confirm the right target.
- Both SQL scripts ship **disabled** (`and false`). They change nothing until
  you deliberately flip that single token to `true`.
- The automated `twiddloo` profile is refused by the delete script
  (`twiddloo_refused`).
- No service-role key is printed, stored in a file, or sent to the browser.
- The SQL Editor runs as the table-owner role, which bypasses RLS. Browser
  roles cannot do any of this: `profiles` has no `DELETE` policy, its only
  `UPDATE` policy is for the row's own owner, and the P1 migration revoked
  browser `SELECT` down to six safe columns.

## Prerequisites

- **SQL scripts:** Supabase SQL Editor (or any table-owner connection).
- **Auth script:** a local copy of this repo, plus two environment variables
  (set them in your shell or `.env.local`, which is git-ignored):

  ```
  NEXT_PUBLIC_SUPABASE_URL=<project url>
  SUPABASE_SERVICE_ROLE_KEY=<service-role key>
  ```

  Run it with `npx tsx`. Without `--apply` it is a pure dry run.

## Suggested order of work

1. Run `delete_profiles.sql` **SECTION 1** (inspect) and read the foreign keys,
   cascades and triggers it reports for *your* database.
2. Pick your UUIDs (Supabase → Table Editor → `profiles`, or the SQL Editor).
3. Unlist? Run `unlist_profiles.sql`, review, flip the flag, run again.
4. Deleting? Take the **SECTION 2a** backup first.
5. If you also want the login removed, run `delete_auth_accounts.ts` first.
6. Verify with the queries below.

## Verify afterwards

```sql
-- profile rows gone? (expect 0)
select count(*) from public.profiles
where id in ('<uuid>'::uuid);

-- auth accounts gone? (expect 0 — needs the service-role/dashboard, not SQL)
-- use the Auth admin UI, or re-run delete_auth_accounts.ts without --apply.
```

## Not touched

These operations do not alter the Supabase schema, RLS policies, grants,
triggers, or any application code, so **no migration is required** and existing
RLS keeps working unchanged.
