# Supabase Setup for Twiddl Trivia

## 1) Create a Supabase project

1. Go to https://app.supabase.com and sign in.
2. Create a new project.
3. Choose a project name like `twiddl-trivia`.
4. Note the database password and project region.

## 2) Configure Auth

1. In Supabase, open `Authentication -> Settings`.
2. Under `Enable email sign-ups`, make sure email auth is enabled.
3. Enable `Sign in with OTP` if you want passwordless login.

## 3) Create the database tables and policies

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
  correct_answer_index int not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- answers table
create table if not exists answers (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references questions(id) on delete cascade,
  responder_id uuid not null references profiles(id) on delete cascade,
  selected_choice_index int not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (question_id, responder_id)
);

create table if not exists bot_follow_opt_outs (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

If the base tables already exist, run this additive migration once before using free-text questions and twiddlBot:

```sql
alter table questions add column if not exists question_type text not null default 'multiple_choice';
alter table questions add column if not exists correct_answer text;
alter table answers add column if not exists answer_text text;
alter table answers alter column selected_choice_index drop not null;

insert into profiles (id, email, username, display_name, bio, is_public)
values ('00000000-0000-4000-8000-000000000001', 'twiddlbot@twiddl.local', 'twiddlBot', 'twiddlBot', 'An automated trivia companion.', true)
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

Enable row-level security and add the policies required by browser/server clients:

```sql
alter table profiles enable row level security;
alter table follows enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table bot_follow_opt_outs enable row level security;

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
create policy "Users can create their own questions"
  on questions for insert with check (auth.uid() = author_id);

create policy "Answers are readable by participants"
  on answers for select using (
    auth.uid() = responder_id or
    exists (select 1 from questions where questions.id = answers.question_id and questions.author_id = auth.uid())
  );
create policy "Users can create their own answers"
  on answers for insert with check (auth.uid() = responder_id);
```

The application uses the server-only service-role client for protected server reads and writes. Grant it access explicitly:

```sql
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on bot_follow_opt_outs to service_role;
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
- Apply database constraints and policies in Supabase before deploying.
- The `answers` table has a unique `(question_id, responder_id)` constraint so a user can answer each question only once.
- Deployments using `vercel.json` call `/api/cron/twiddl-bot` once per day. Set `CRON_SECRET` in the deployment environment; Vercel should be configured to send the same secret as a bearer token.
- Existing users are initially followed to twiddlBot by the migration above. The app preserves an explicit unfollow on subsequent profile syncs.
