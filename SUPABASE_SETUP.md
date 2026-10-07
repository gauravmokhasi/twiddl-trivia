# Supabase Setup for Twiddl Trivia

## 1) Create a Supabase project

1. Go to https://app.supabase.com and sign in.
2. Create a new project.
3. Choose a project name like `twiddl-trivia`.
4. Note the database password and project region.

## 2) Configure Auth

Email sign-in (magic link) is handled by Supabase Auth. Brevo is only the SMTP provider behind Supabase and should never be called from application code.

### Email (magic link)

1. In Supabase, open `Authentication -> Settings`.
2. Under `Enable email sign-ups`, make sure email auth is enabled.
3. Enable `Sign in with OTP` for passwordless login.
4. Set `Authentication -> Emails -> SMTP Settings` to your Brevo credentials so Supabase delivers the sign-in emails.
5. In Supabase, open `Authentication -> URL Configuration`:
   - Site URL: `https://twiddl-trivia-twiddl.vercel.app`
   - Redirect URLs:
     - `https://twiddl-trivia-twiddl.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback`
     - `https://*-<your-vercel-scope>.vercel.app/auth/callback` (optional, for preview deployments)

   Do not use `https://twiddl-trivia.vercel.app`: it is a stale host that serves the app without
   sharing its login cookies, so starting a sign-in there drops you on the canonical host with a
   dead link and forces a second sign-in. If it still resolves, redirect it to the canonical host.

The app builds its sign-in redirect from `window.location.origin`, so every origin you sign in from should be listed above. If a callback URL is missing from that list Supabase falls back to the Site URL instead; the app exchanges the code there too, but listing the callback is what keeps sign-in working reliably on the first click.

## 3) Create the database tables and policies

For a **fresh project**, run the setup SQL below, including the server-only creation function further down. It represents the final P0 + P1 schema.

For an **existing deployment**, complete [P0_ROLLOUT.md](P0_ROLLOUT.md), then apply the single P1 migration using [P1_ROLLOUT.md](P1_ROLLOUT.md). Do not re-run the fresh setup or apply both P0 migrations automatically.

Run the following SQL in Supabase SQL Editor:

```sql
create extension if not exists "uuid-ossp";

-- profiles table
create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  username text unique not null,
  display_name text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- follows table
create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

-- questions table
create table if not exists questions (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  choices text[] not null,
  question_type text not null default 'multiple_choice',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- Keys never belong on browser-readable question rows.
create table if not exists question_secrets (
  question_id uuid primary key references questions(id) on delete cascade,
  correct_answer_index int,
  correct_answer text,
  constraint question_secrets_one_key check (
    (correct_answer_index is not null and correct_answer_index >= 0 and correct_answer is null)
    or (correct_answer_index is null and correct_answer is not null and length(btrim(correct_answer)) > 0)
  )
);

-- answers table
create table if not exists answers (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references questions(id) on delete cascade,
  responder_id uuid not null references profiles(id) on delete cascade,
  selected_choice_index int,
  answer_text text,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (question_id, responder_id)
);

create table if not exists bot_follow_opt_outs (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- question_reports table
-- Private quality reports from people who answered a question incorrectly. Only the question's
-- author ever reads these, and only through server code using the service role.
create table if not exists question_reports (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references questions(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('answer_wrong', 'ambiguous')),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, reporter_id)
);

create index if not exists question_reports_question_id_idx on question_reports (question_id);
```

Seed twiddloo and its initial relationships (safe to run again):

```sql
insert into profiles (id, email, username, display_name, bio, is_public)
values ('00000000-0000-4000-8000-000000000001', 'twiddloo@twiddl.local', 'twiddloo', 'twiddloo', 'An automated trivia companion.', true)
on conflict (id) do update set is_public = true;

insert into follows (follower_id, followee_id)
select '00000000-0000-4000-8000-000000000001', id
from profiles
where id <> '00000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into follows (follower_id, followee_id)
select id, '00000000-0000-4000-8000-000000000001'
from profiles
where id <> '00000000-0000-4000-8000-000000000001'
on conflict do nothing;
```

If the base tables already exist, run this additive migration once before using question quality reports:

```sql
create table if not exists question_reports (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references questions(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('answer_wrong', 'ambiguous')),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, reporter_id)
);

create index if not exists question_reports_question_id_idx on question_reports (question_id);

-- Deliberately no policies below. These reports are private to the question's author, and the app
-- reads and writes them only through the service-role client, which bypasses row-level security.
alter table question_reports enable row level security;

grant all privileges on table question_reports to service_role;
```

If the table is missing, nothing breaks: the question page simply renders without the quality summary, and the report prompt returns "Unable to send that right now."

The automated profile used to be called `twiddlBot`. Run this once to rename it to `twiddloo`; it is safe to re-run, and it can run before or after the identity migration below:

```sql
update profiles
set username = 'twiddloo',
    display_name = 'twiddloo',
    email = 'twiddloo@twiddl.local'
where id = '00000000-0000-4000-8000-000000000001';
```

Handles and public names share one namespace, so no two profiles can hold the same username or the same public name, and a public name cannot shadow another profile's handle. Comparison ignores case and surrounding spaces, so `Maya`, `maya` and `maya ` are the same claim.

**Run the two preview queries first.** They should return no rows. If either does, fix those profiles before creating the index, because the index refuses to be built over existing duplicates:

```sql
select lower(username) as value, count(*) as profiles, array_agg(username) as handles
from profiles
group by lower(username)
having count(*) > 1;

select lower(display_name) as value, count(*) as profiles, array_agg(username) as handles
from profiles
where display_name is not null and display_name <> ''
group by lower(display_name)
having count(*) > 1;
```

Then apply the rule itself:

```sql
-- One handle per person, ignoring case.
create unique index if not exists profiles_username_lower_key on profiles (lower(username));

-- A handle and a public name may not collide with each other either, which no single index can
-- express, so the rule lives in a trigger.
create or replace function enforce_unique_profile_identity()
returns trigger
language plpgsql
as $$
begin
  -- Only identity changes are validated, so updating another column (or an untouched legacy row that
  -- already shares a name) can never start failing.
  if tg_op = 'UPDATE'
    and lower(new.username) = lower(old.username)
    and lower(coalesce(new.display_name, '')) = lower(coalesce(old.display_name, '')) then
    return new;
  end if;

  if exists (
    select 1
    from profiles p
    where p.id <> new.id
      and (
        lower(p.username) = lower(new.username)
        or lower(p.username) = lower(coalesce(new.display_name, ''))
        or (
          new.display_name is not null
          and lower(new.display_name) <> ''
          and lower(coalesce(p.display_name, '')) = lower(new.display_name)
        )
      )
  ) then
    raise exception 'That username or public name is already taken.' using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_identity_unique on profiles;
create trigger profiles_identity_unique
  before insert or update on profiles
  for each row execute function enforce_unique_profile_identity();
```

The app also pre-checks the same rule so the user gets a specific message ("That username is already taken." rather than a raw constraint error), but the trigger is the authority: a race between the two still cannot create a duplicate.

Enable row-level security and add the policies required by browser/server clients:

```sql
alter table profiles enable row level security;
alter table follows enable row level security;
alter table questions enable row level security;
alter table question_secrets enable row level security;
alter table answers enable row level security;
alter table bot_follow_opt_outs enable row level security;
alter table question_reports enable row level security;

create policy "Public profiles are readable"
  on profiles for select using (is_public = true or auth.uid() = id);
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can read their follows"
  on follows for select using (auth.uid() = follower_id or auth.uid() = followee_id);
create policy "Users can follow as themselves"
  on follows for insert with check (auth.uid() = follower_id);
create policy "Users can delete their follows"
  on follows for delete using (auth.uid() = follower_id);

create policy "Questions are readable"
  on questions for select using (is_public = true or auth.uid() = author_id);

create policy "Answers are readable by participants"
  on answers for select using (
    auth.uid() = responder_id or
    exists (select 1 from questions where questions.id = answers.question_id and questions.author_id = auth.uid())
  );
```

Apply these permissions as well; RLS alone does not hide columns, and browser mutations must never bypass grading:

```sql
-- Stop every direct browser mutation (including column grants), and hide legacy keys now.
drop policy if exists "Users can create their own questions" on public.questions;
drop policy if exists "Users can create their own answers" on public.answers;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
revoke all privileges on public.questions, public.answers from public, anon, authenticated;
do $$
declare relation_name text; column_names text;
begin
  foreach relation_name in array array['questions', 'answers'] loop
    select string_agg(quote_ident(attname), ', ') into column_names
    from pg_attribute where attrelid = format('public.%I', relation_name)::regclass
      and attnum > 0 and not attisdropped;
    execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', column_names, relation_name);
  end loop;
end;
$$;
grant select (id, author_id, text, choices, question_type, is_public, created_at)
  on public.questions to anon, authenticated;
grant select on public.answers to anon, authenticated;
grant all privileges on public.questions, public.answers to service_role;

alter table public.question_secrets enable row level security;
revoke all privileges on public.question_secrets from public, anon, authenticated;
grant all privileges on public.question_secrets to service_role;
```

Protect profile email and create the server-only operations (required by question posting and profile counts):

```sql
-- Keep email for server-side profile sync, but never expose it to browser roles.
-- Clear table grants AND any existing column SELECT grants, including PUBLIC grants.
revoke select on public.profiles from public, anon, authenticated;
do $$
declare column_names text;
begin
  select string_agg(quote_ident(attname), ', ') into column_names
  from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke select (%s) on public.profiles from public, anon, authenticated', column_names);
end;
$$;
grant select (id, username, display_name, bio, is_public, created_at)
  on public.profiles to anon, authenticated;
grant all privileges on public.profiles to service_role;

create index if not exists questions_author_created_at_idx on public.questions (author_id, created_at desc);

-- Replace P0's writer without changing its signature, so the running P0 deployment can still call it.
-- Read-only API checks help the UI; this function is the authority for the rolling limit.
create or replace function public.create_question_with_secret(
  p_author_id uuid, p_text text, p_choices text[], p_question_type text,
  p_is_public boolean, p_correct_answer_index int, p_correct_answer text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare created public.questions; creation_time timestamptz;
begin
  if p_question_type is null or p_question_type not in ('multiple_choice', 'free_text')
    or p_text is null or length(btrim(p_text)) not between 1 and 320
    or p_is_public is null or p_choices is null then
    raise exception 'Invalid question.' using errcode = '22023';
  end if;
  if p_question_type = 'multiple_choice' then
    if cardinality(p_choices) not between 2 and 4 or p_correct_answer_index is null
      or p_correct_answer_index < 0 or p_correct_answer_index >= cardinality(p_choices)
      or p_correct_answer is not null
      or exists (select 1 from unnest(p_choices) choice where choice is null or length(btrim(choice)) not between 1 and 120) then
      raise exception 'Invalid multiple-choice answer key.' using errcode = '22023';
    end if;
  elsif cardinality(p_choices) <> 0 or p_correct_answer_index is not null
    or p_correct_answer is null or length(btrim(p_correct_answer)) not between 1 and 160 then
    raise exception 'Invalid free-text answer key.' using errcode = '22023';
  end if;

  -- One transaction-scoped 64-bit lock per author, shared by user and bot creation paths.
  -- A hash collision only serializes unrelated authors; it cannot weaken enforcement.
  -- Capture the time AFTER waiting, so a queued transaction cannot use a stale start time.
  perform pg_advisory_xact_lock(hashtextextended(p_author_id::text, 0));
  creation_time := clock_timestamp();
  if exists (
    select 1 from public.questions
    where author_id = p_author_id and created_at > creation_time - interval '24 hours'
  ) then
    raise exception 'You can only ask one question every 24 hours.' using errcode = 'TWD01';
  end if;

  insert into public.questions (author_id, text, choices, question_type, is_public, created_at)
  values (p_author_id, btrim(p_text), p_choices, p_question_type, p_is_public, creation_time)
  returning * into created;
  insert into public.question_secrets (question_id, correct_answer_index, correct_answer)
  values (created.id, p_correct_answer_index, p_correct_answer)
  on conflict (question_id) do update set
    correct_answer_index = excluded.correct_answer_index, correct_answer = excluded.correct_answer;
  -- Return public question metadata only; never serialize the private key.
  return jsonb_build_object('id', created.id, 'author_id', created.author_id, 'text', created.text,
    'choices', created.choices, 'question_type', created.question_type,
    'is_public', created.is_public, 'created_at', created.created_at);
end;
$$;
revoke all on function public.create_question_with_secret(uuid, text, text[], text, boolean, int, text)
  from public, anon, authenticated;
grant execute on function public.create_question_with_secret(uuid, text, text[], text, boolean, int, text)
  to service_role;

-- Match profile play: ALL of the author's questions, no archive-page/date/public-only filter.
-- A single snapshot prevents the total and remaining count disagreeing during a new post.
create or replace function public.profile_question_counts(p_author_id uuid, p_viewer_id uuid)
returns table (total_questions bigint, unanswered_questions bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*), count(*) filter (
    where p_viewer_id is not null and p_viewer_id <> q.author_id and a.question_id is null
  )
  from public.questions q
  left join public.answers a on a.question_id = q.id and a.responder_id = p_viewer_id
  where q.author_id = p_author_id;
$$;
revoke all on function public.profile_question_counts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.profile_question_counts(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
```

No browser policies are added for `question_secrets`: keys are read only by trusted server code. The creation function takes a transaction-scoped advisory lock per author, checks the rolling 24-hour limit, saves the public row and key together, and returns only safe columns. Profile counts cover every question by that author, matching profile play rather than archive pagination.

Email stays in `profiles` for server-side account synchronization. Browser SELECT grants allow only `id`, `username`, `display_name`, `bio`, `is_public`, and `created_at`; `SELECT *` and requests filtering/ordering by email will fail for browser roles. The app uses explicit profile selections; account UI gets the signed-in user's own email from Supabase Auth.

“Unlisted” means excluded from Universe discovery, while still reachable by handle. It does not require follower approval.

No policies are added for `question_reports` on purpose. The table is written only by the report API route and read only for the question's author, both through the service-role client, so no browser or session client should touch it at all.

The application uses the server-only service-role client for protected server reads and writes. Grant it access explicitly:

```sql
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on bot_follow_opt_outs to service_role;
grant all privileges on question_reports to service_role;
```

## 4) Set up Supabase Auth hooks

1. In Supabase, open `Authentication -> Settings -> External OAuth` if you want third-party sign-in.
2. For the basic app, email OTP is enough.

## 5) Add env vars to your project

Copy `.env.local.example` to `.env.local` and fill in the values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-random-cron-secret
```

## 6) Install dependencies

In your project folder run:

```bash
npm install
```

## 7) Run the app

```bash
npm run dev
```

## 8) Connect authenticated users to profiles

After sign-in, the app creates or synchronizes a profile row. Users without a chosen username are sent to `/profile` to create one. The username is stored in `profiles.username` and must be unique.

## 9) Optional: Seed demo users

You can insert demo profiles using SQL:

```sql
insert into profiles (email, username, display_name, bio, is_public) values
('jamie@example.com', 'jamie', 'Jamie', 'Trivia host and storyteller.', true),
('maya@example.com', 'maya', 'Maya', 'Loves science and puzzles.', true);
```

## 10) Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Do not commit `.env.local`.
- Existing deployments: apply P0 PREPARE, deploy the P0 code, smoke-test, then apply CLEANUP. See `P0_ROLLOUT.md`. After that, apply the single P1 migration before deploying P1; see `P1_ROLLOUT.md`.
- Never expose `question_secrets` or re-grant browser writes to `questions`/`answers`. Answer results reveal keys only after a successfully persisted answer (or to the question author).
- Keep browser email SELECT grants revoked, including table-wide and column-specific grants.
- All application question creation (including twiddloo) uses `create_question_with_secret`; the database enforces one post per rolling 24 hours per author. A slightly early/overlapping bot invocation returns the existing question rather than posting twice.
- The `answers` table has a unique `(question_id, responder_id)` constraint so a user can answer each question only once.
- Handles and public names are unique, ignoring case, enforced by the `profiles_username_lower_key` index and the `profiles_identity_unique` trigger.
- Authors delete their own questions through the service-role client. The `questions` table has no `delete` policy, so no browser or session client can remove rows directly, and `answers` and `question_reports` follow their question away through `on delete cascade`.
- Deployments using `vercel.json` call `/api/cron/twiddloo` once per day. Set `CRON_SECRET` in the deployment environment; Vercel should be configured to send the same secret as a bearer token.
- Existing users are initially followed to twiddloo by the migration above. The app preserves an explicit unfollow on subsequent profile syncs.
