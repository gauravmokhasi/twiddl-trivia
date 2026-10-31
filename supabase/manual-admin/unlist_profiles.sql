-- ============================================================================
-- ADMIN OPERATION A — Unlist selected profiles
-- ============================================================================
-- Run manually in the Supabase SQL Editor. NOT exposed to Twiddl users.
--
-- WHAT IT DOES
--   Sets profiles.is_public = false for exactly the UUIDs listed in the
--   `targets` CTE. "Unlisted" is Twiddl's existing term for a profile that is
--   omitted from Universe, hidden from Explore for people who do not already
--   follow it, and still reachable by direct handle (/profile/<username>).
--
-- WHY is_public AND NOT A MIGRATION
--   profiles.is_public already IS the listing flag. It is what the in-app
--   Public/Unlisted toggle writes (src/app/api/profile-visibility/route.ts),
--   what Universe filters on (src/app/universe/page.tsx), and what the profile
--   badge labels "Unlisted". It does not control suspension, login or any
--   authentication state, so reusing it is correct and no schema change is
--   required. Nothing was added to supabase/migrations for this operation.
--
-- WHAT IT PRESERVES
--   Everything else: the Supabase Auth account, email, username, display name,
--   bio, questions, answers, follows, followers and question reports. It is one
--   boolean on one row.
--
-- REVERSIBILITY — FULLY REVERSIBLE
--   Set is_public back to true for the same UUIDs. Nothing is destroyed.
--
-- WHO CAN RUN IT
--   The SQL Editor runs as the table-owner role, which bypasses RLS. Browser
--   roles cannot do this: profiles has no DELETE policy, its only UPDATE policy
--   is for the row's own owner, and P1 revoked SELECT down to six safe columns.
--
-- HOW TO RUN
--   1. Replace the null::uuid placeholders with real profile UUIDs.
--   2. Run the file as-is. The `and false` guard means it changes NOTHING.
--      Review the result grid.
--   3. Change that single `and false` to `and true`.
--   4. Run again. The grid now reports rows_updated and updated_rows.
--
-- SCOPE SAFETY
--   The statement only ever matches the explicit UUID list. An empty list
--   matches zero rows, so this can never widen to "all profiles". Nothing here
--   filters on display name; display names appear only as read-only context.
-- ============================================================================

with targets (id) as materialized (
  select unnest(
    array_remove(
      array[
        null::uuid,   -- ← REPLACE with a profile UUID
        null::uuid    -- ← REPLACE with another profile UUID (add more lines as needed)
      ],
      null
    )
  )
),
preview as (
  select
    t.id         as requested_id,
    p.id         as matched_id,
    p.username,
    p.display_name,
    p.email,                       -- read-only context to confirm the right person
    p.is_public  as is_public_before
  from targets t
  left join public.profiles p on p.id = t.id
),
applied as (
  update public.profiles p
     set is_public = false
  from targets t
  where p.id = t.id
    and p.is_public is distinct from false
    and false        -- ← change `false` to `true` to apply (step 3 above)
  returning p.id, p.username, p.display_name, p.is_public
)
select
  (select count(*) from targets)                       as target_ids_supplied,
  (select count(*) from preview where matched_id is not null) as target_profiles_found,
  (select count(*) from preview where matched_id is null)     as target_ids_not_found,
  (select count(*) from applied)                       as rows_updated,
  (select exists (
     select 1 from targets
     where id = '00000000-0000-4000-8000-000000000001'::uuid
   ))                                                  as includes_twiddloo_bot,
  coalesce((
    select jsonb_agg(to_jsonb(p) order by p.username)
    from preview p
    where p.matched_id is not null
  ), '[]'::jsonb)                                      as target_rows,
  coalesce((
    select jsonb_agg(to_jsonb(a))
    from applied a
  ), '[]'::jsonb)                                      as updated_rows;

-- ============================================================================
-- TO REVERSE (restores listed status for the same UUIDs)
-- ============================================================================
-- Set the guard below back to `true` after pasting the UUIDs, then run.
--
-- with targets (id) as materialized (
--   select unnest(array_remove(array[ null::uuid, null::uuid ], null))
-- ),
-- reverted as (
--   update public.profiles p
--      set is_public = true
--   from targets t
--   where p.id = t.id
--     and p.is_public is distinct from true
--     and false        -- ← change to `true` to apply the revert
--   returning p.id, p.username
-- )
-- select count(*) as rows_reverted,
--        coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) as reverted_rows
-- from reverted r;
