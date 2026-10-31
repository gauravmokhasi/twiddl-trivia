-- ============================================================================
-- ADMIN OPERATION B - Delete selected profile ROWS
-- ============================================================================
-- Run manually in the Supabase SQL Editor. NOT exposed to Twiddl users.
-- THIS IS DESTRUCTIVE AND IRREVERSIBLE. Read the whole file before running.
--
-- ---------------------------------------------------------------------------
-- READ THIS FIRST: profile row  !=  Supabase Auth account
-- ---------------------------------------------------------------------------
-- public.profiles.id is a plain uuid primary key. There is NO foreign key to
-- auth.users and NO trigger on auth.users (see SECTION 1's output). The two
-- are linked only by convention: profiles.id happens to hold the auth user id.
--
--   * Deleting a profile ROW (this file) leaves the Auth account alive. The
--     person can still sign in, and src/app/api/profile-sync/route.ts upserts
--     the profile row back on their next visit - recreating it, with
--     is_public defaulting to true. A profile-row delete alone is therefore
--     NOT a removal of the person from Twiddl.
--
--   * Deleting the AUTH ACCOUNT (supabase/manual-admin/delete_auth_accounts.ts,
--     which calls auth.admin.deleteUser) leaves the profile row and all its
--     questions/answers/follows orphaned.
--
--   * A COMPLETE removal needs both, in this order:
--       1. delete_auth_accounts.ts  (stops them signing in and re-syncing)
--       2. this file                (removes the orphaned row and its data)
--     Do the auth deletion first. The reverse order leaves a window in which
--     the person signs in and ProfileSync restores everything.
--
-- WHAT THIS FILE DOES
--   Deletes ONLY the rows in public.profiles matching the explicit UUID list,
--   and, through `on delete cascade`, the rows that hang off them.
--
-- ---------------------------------------------------------------------------
-- CASCADE SUMMARY (verified against the live schema by SECTION 1)
-- ---------------------------------------------------------------------------
-- Directly referencing profiles(id), all ON DELETE CASCADE:
--   follows.follower_id, follows.followee_id, questions.author_id,
--   answers.responder_id, bot_follow_opt_outs.user_id,
--   question_reports.reporter_id
-- Transitively via questions(id), all ON DELETE CASCADE:
--   question_secrets.question_id, answers.question_id,
--   question_reports.question_id
--
-- Deleting one profile therefore removes:
--   * every question they asked, plus each question's private answer key;
--   * every answer THEY gave to other people's questions;
--   * every OTHER person's answer to THEIR questions  <- destroys other users'
--     answer history and correct-answer statistics, not just theirs;
--   * every quality report they filed, and every report filed on their
--     questions;
--   * every follow edge in both directions;
--   * their bot-follow opt-out, if any.
--
-- REVERSIBILITY - NOT REVERSIBLE. Cascade deletes cannot be undone from SQL.
--   Take a backup first (SECTION 2a).
--
-- SAFETY GUARDS BUILT IN
--   * Only the explicit UUID list is ever matched; an empty list deletes zero
--     rows. No predicate can widen to "all profiles".
--   * The automated twiddloo profile is refused outright (twiddloo_refused).
--   * Nothing filters on display name.
--   * The destructive statement ships disabled (`and false`) and changes
--     nothing until you deliberately flip that one token.
--
-- HOW TO RUN
--   1. SECTION 1  (inspect) - run alone, read the output. No changes.
--   2. SECTION 2a (backup)  - run alone, export/copy the result. No changes.
--   3. SECTION 2b (delete)  - fill in UUIDs, run as-is, review. Then change
--      the single `and false` to `and true` and run again.
-- ============================================================================


-- ============================================================================
-- SECTION 1 - INSPECT: actual foreign keys, cascades and triggers (READ ONLY)
-- ============================================================================
-- Run this section on its own. It reads pg_catalog, so it reflects what the
-- database really does rather than what the setup docs claim.

select jsonb_pretty(
  jsonb_build_object(
    'foreign_keys_referencing_profiles',
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'child_table',  c.conrelid::regclass::text,
                   'column',       a.attname,
                   'parent_table', c.confrelid::regclass::text,
                   'on_delete',    case c.confdeltype
                                     when 'c' then 'CASCADE'
                                     when 'a' then 'NO ACTION'
                                     when 'r' then 'RESTRICT'
                                     when 'n' then 'SET NULL'
                                     when 'd' then 'SET DEFAULT'
                                   end
                 )
                 order by c.conrelid::regclass::text, a.attname
               )
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'f'
          and c.confrelid = 'public.profiles'::regclass
      ), '[]'::jsonb),

    'foreign_keys_referencing_questions',
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'child_table',  c.conrelid::regclass::text,
                   'column',       a.attname,
                   'parent_table', c.confrelid::regclass::text,
                   'on_delete',    case c.confdeltype
                                     when 'c' then 'CASCADE'
                                     when 'a' then 'NO ACTION'
                                     when 'r' then 'RESTRICT'
                                     when 'n' then 'SET NULL'
                                     when 'd' then 'SET DEFAULT'
                                   end
                 )
                 order by c.conrelid::regclass::text, a.attname
               )
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'f'
          and c.confrelid = 'public.questions'::regclass
      ), '[]'::jsonb),

    'triggers_on_profiles_and_questions',
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'table',    c.relname,
                   'trigger',  t.tgname,
                   'function', p.proname
                 )
                 order by c.relname, t.tgname
               )
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_proc  p on p.oid = t.tgfoid
        where not t.tgisinternal
          and c.oid in ('public.profiles'::regclass, 'public.questions'::regclass)
      ), '[]'::jsonb),

    'auth_link',
      'public.profiles.id has NO foreign key to auth.users and there is no trigger on auth.users - deleting a profile row does NOT delete the auth user.'
  )
) as schema_dependencies;


-- ============================================================================
-- SECTION 2a - BACKUP (READ ONLY)
-- ============================================================================
-- Deletion is irreversible, so capture the rows first. Run this on its own and
-- export the result with the SQL Editor's CSV download, or copy the JSON
-- somewhere safe.

with targets (id) as materialized (
  select unnest(
    array_remove(
      array[
        null::uuid,   -- REPLACE with a profile UUID
        null::uuid    -- REPLACE with another profile UUID
      ],
      null
    )
  )
)
select
  (select count(*) from targets) as target_ids_supplied,
  coalesce((
    select jsonb_agg(to_jsonb(p) order by p.username)
    from public.profiles p
    where p.id in (select id from targets)
  ), '[]'::jsonb) as profile_rows_to_delete,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'question_id', q.id, 'text', q.text, 'created_at', q.created_at)
             order by q.created_at)
    from public.questions q
    where q.author_id in (select id from targets)
  ), '[]'::jsonb) as questions_to_delete;


-- ============================================================================
-- SECTION 2b - DELETE (destructive; ships disabled)
-- ============================================================================
-- 1. Paste the SAME UUIDs into the `targets` array below.
-- 2. Run as-is. `and false` means it deletes NOTHING. Review the grid. The
--    cascade_* columns then show what WOULD be removed.
-- 3. Change that single `and false` to `and true` and run again. The grid
--    reports profile_rows_deleted and deleted_rows.
--
-- NOTE ON THE CASCADE COLUMNS: every part of one statement shares one
-- snapshot, so those counts always describe the state before the delete -
-- i.e. exactly what was removed. They do not drop to zero afterwards.

with targets (id) as materialized (
  select unnest(
    array_remove(
      array[
        null::uuid,   -- REPLACE with a profile UUID
        null::uuid    -- REPLACE with another profile UUID
      ],
      null
    )
  )
),
to_delete (id) as materialized (
  select id from targets
  where id <> '00000000-0000-4000-8000-000000000001'::uuid   -- never remove the bot
),
preview as (
  select
    t.id as requested_id,
    p.id as matched_id,
    p.username,
    p.display_name,
    p.email
  from targets t
  left join public.profiles p on p.id = t.id
),
deleted as (
  delete from public.profiles p
  using to_delete t
  where p.id = t.id
    and false        -- change `false` to `true` to apply (step 3 above)
  returning p.id, p.username, p.display_name, p.email
)
select
  (select count(*) from targets)                                              as target_ids_supplied,
  (select count(*) from to_delete)                                            as ids_eligible_after_bot_guard,
  (select exists (select 1 from targets
                  where id = '00000000-0000-4000-8000-000000000001'::uuid))   as twiddloo_refused,
  (select count(*) from preview where matched_id is not null)                 as target_profiles_found,
  (select count(*) from preview where matched_id is null)                     as target_ids_not_found,
  (select count(*) from deleted)                                              as profile_rows_deleted,

  (select count(*) from public.questions q
    where q.author_id in (select id from to_delete))                          as cascade_questions,
  (select count(*) from public.question_secrets s
    where s.question_id in (select q.id from public.questions q
                            where q.author_id in (select id from to_delete))) as cascade_question_keys,
  (select count(*) from public.answers a
    where a.question_id in (select q.id from public.questions q
                            where q.author_id in (select id from to_delete))) as cascade_answers_on_those_questions,
  (select count(*) from public.question_reports r
    where r.question_id in (select q.id from public.questions q
                            where q.author_id in (select id from to_delete))) as cascade_reports_on_those_questions,
  (select count(*) from public.answers a
    where a.responder_id in (select id from to_delete))                       as cascade_answers_they_gave,
  (select count(*) from public.question_reports r
    where r.reporter_id in (select id from to_delete))                        as cascade_reports_they_filed,
  (select count(*) from public.follows f
    where f.follower_id in (select id from to_delete)
       or f.followee_id in (select id from to_delete))                        as cascade_follow_edges,
  (select count(*) from public.bot_follow_opt_outs b
    where b.user_id in (select id from to_delete))                            as cascade_bot_opt_outs,

  coalesce((select jsonb_agg(to_jsonb(p))
            from preview p where p.matched_id is not null), '[]'::jsonb)      as target_rows,
  coalesce((select jsonb_agg(to_jsonb(d)) from deleted d), '[]'::jsonb)       as deleted_rows;
