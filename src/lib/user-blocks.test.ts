import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

import { FOLLOW_REFUSED_MESSAGE, canBlock, excludeBlockedAuthors, isAuthorBlocked } from './user-blocks';

const ALICE = '11111111-1111-4111-8111-111111111111'; // blocker
const BOB = '22222222-2222-4222-8222-222222222222';   // blocked
const CAROL = '33333333-3333-4333-8333-333333333333'; // unrelated
const QUESTION = '44444444-4444-4444-8444-444444444444';
const ANSWER = '55555555-5555-4555-8555-555555555555';

// --- Pure rules --------------------------------------------------------------

test('questions from blocked authors are removed before anything is rendered', () => {
  const rows = [
    { id: 'q1', author_id: ALICE },
    { id: 'q2', author_id: BOB },
    { id: 'q3', author_id: ALICE },
  ];
  const filtered = excludeBlockedAuthors(rows, [ALICE]);

  assert.deepEqual(filtered.map((row) => row.id), ['q2']);
  assert.ok(isAuthorBlocked(ALICE, [ALICE]));
  assert.ok(!isAuthorBlocked(BOB, [ALICE]));
  // No blocks means no change, so the common path stays untouched.
  assert.equal(excludeBlockedAuthors(rows, []).length, 3);
});

test('a refused follow message never mentions blocks', () => {
  assert.doesNotMatch(FOLLOW_REFUSED_MESSAGE, /block/i);
  assert.ok(canBlock(ALICE, BOB));
  assert.ok(!canBlock(ALICE, ALICE), 'a user cannot block themselves');
  assert.ok(!canBlock('', BOB));
});

// --- Database behaviour ------------------------------------------------------

// Mirrors the schema and RLS in SUPABASE_SETUP.md for the tables blocking
// touches, so the real migration below is applied on top of it.
const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;

create table profiles (
  id uuid primary key,
  email text unique not null,
  username text unique not null,
  display_name text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create table questions (
  id uuid primary key,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  choices text[] not null,
  question_type text not null default 'multiple_choice',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table question_secrets (
  question_id uuid primary key references questions(id) on delete cascade,
  correct_answer_index int,
  correct_answer text
);

create table answers (
  id uuid primary key,
  question_id uuid not null references questions(id) on delete cascade,
  responder_id uuid not null references profiles(id) on delete cascade,
  selected_choice_index int,
  answer_text text,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (question_id, responder_id)
);

create table question_reports (
  id uuid primary key,
  question_id uuid not null references questions(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table follows enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;

create policy "Public profiles are readable"
  on profiles for select using (is_public = true or auth.uid() = id);
create policy "Users can read their follows"
  on follows for select using (auth.uid() = follower_id or auth.uid() = followee_id);
create policy "Questions are readable"
  on questions for select using (is_public = true or auth.uid() = author_id);
create policy "Answers are readable by participants"
  on answers for select using (
    auth.uid() = responder_id or
    exists (select 1 from questions where questions.id = answers.question_id and questions.author_id = auth.uid())
  );

grant select, insert, update, delete on public.profiles, public.follows to anon, authenticated;
grant select, insert on public.questions to anon, authenticated;
grant select on public.answers to anon, authenticated;
grant all on all tables in schema public to service_role;
`;

const SEED = `
insert into profiles (id, email, username) values
  ('${ALICE}', 'alice@example.test', 'alice'),
  ('${BOB}', 'bob@example.test', 'bob'),
  ('${CAROL}', 'carol@example.test', 'carol');

insert into questions (id, author_id, text, choices, is_public)
  values ('${QUESTION}', '${ALICE}', 'A question from alice?', '{Alpha,Beta}', true);
insert into question_secrets (question_id, correct_answer_index) values ('${QUESTION}', 0);
insert into answers (id, question_id, responder_id, selected_choice_index, is_correct)
  values ('${ANSWER}', '${QUESTION}', '${BOB}', 0, true);
`;

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(BASE_SCHEMA);
  await db.exec(SEED);
  // The real migration under test, run unmodified.
  await db.exec(await readFile('supabase/migrations/202610090001_p2_user_blocks.sql', 'utf8'));
});

/** Runs `sql` as a browser role with `auth.uid()` set, mirroring PostgREST. */
async function asRole(role: string, userId: string | null, sql: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec('reset role');
  }
}

async function count(sql: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(sql);
  return Number(rows[0].n);
}

async function addBlock(blocker: string = ALICE, blocked: string = BOB) {
  await db.query(`insert into user_blocks (blocker_id, blocked_id) values ('${blocker}', '${blocked}')`);
}

async function removeBlock(blocker: string = ALICE, blocked: string = BOB) {
  await db.query(`delete from user_blocks where blocker_id = '${blocker}' and blocked_id = '${blocked}'`);
}

test('blocking removes the follow the blocked user already had', async () => {
  await db.query(`insert into follows (follower_id, followee_id) values ('${BOB}', '${ALICE}')`);
  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' and followee_id = '${ALICE}'`),
    1,
    'precondition: bob follows alice',
  );

  await addBlock();

  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' and followee_id = '${ALICE}'`),
    0,
    'the trigger deleted the follow the moment the block was created',
  );
  assert.equal(
    await count(`select count(*) as n from user_blocks where blocker_id = '${ALICE}' and blocked_id = '${BOB}'`),
    1,
    'and the block itself was stored',
  );
});

test('unblocking removes the block but never restores the follow', async () => {
  await removeBlock();

  assert.equal(
    await count(`select count(*) as n from user_blocks where blocker_id = '${ALICE}' and blocked_id = '${BOB}'`),
    0,
    'the block is gone',
  );
  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' and followee_id = '${ALICE}'`),
    0,
    'eligibility returns, but the relationship does not',
  );
});

test('a blocked user cannot follow the blocker, and the refusal gives nothing away', async () => {
  await addBlock();

  await assert.rejects(
    db.query(`insert into follows (follower_id, followee_id) values ('${BOB}', '${ALICE}')`),
    (error: unknown) => {
      const message = String((error as { message?: string })?.message ?? '');
      assert.doesNotMatch(message, /block/i, 'the refusal must not name the reason');
      return true;
    },
  );

  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' and followee_id = '${ALICE}'`),
    0,
  );
});

test('an unrelated user is not caught by the block', async () => {
  // Carol is neither party, so the same insert succeeds for her.
  await db.query(`insert into follows (follower_id, followee_id) values ('${CAROL}', '${ALICE}')`);
  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${CAROL}' and followee_id = '${ALICE}'`),
    1,
  );
  await db.query(`delete from follows where follower_id = '${CAROL}' and followee_id = '${ALICE}'`);
});

test('a blocked user cannot reach the blocker questions from any access path', async () => {
  // Direct read of the table, which is what a crafted PostgREST call performs.
  const asBob = await asRole('authenticated', BOB, `select id from questions where author_id = '${ALICE}'`);
  assert.equal(asBob.rows.length, 0, 'RLS withholds the question from the blocked user');

  const asCarol = await asRole('authenticated', CAROL, `select id from questions where author_id = '${ALICE}'`);
  assert.equal(asCarol.rows.length, 1, 'an unrelated user still sees it');

  const asAlice = await asRole('authenticated', ALICE, `select id from questions where author_id = '${ALICE}'`);
  assert.equal(asAlice.rows.length, 1, 'and the author still sees their own');

  // What the service role hands the app, and what the app then filters out:
  // the elevated client still reads the row, so the app filter is load bearing.
  const { rows } = await db.query<{ id: string; author_id: string }>('select id, author_id from questions');
  assert.equal(rows.length, 1, 'the service-role read is unchanged');
  assert.deepEqual(excludeBlockedAuthors(rows, [ALICE]), [], 'the app removes it before rendering');
  assert.deepEqual(excludeBlockedAuthors(rows, []), rows, 'with no block, nothing is filtered');
});

test('answer queries cannot be used to reach a hidden question', async () => {
  // The answers table carries no question text, so it cannot leak the content.
  const { rows: columns } = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_name = 'answers'",
  );
  const names = columns.map((column) => column.column_name);
  assert.ok(!names.includes('text'), 'answers never carry question text');
  assert.ok(!names.includes('choices'), 'nor the answer choices');

  await db.query(`insert into answers (id, question_id, responder_id, selected_choice_index, is_correct)
    values ('66666666-6666-4666-8666-666666666666', '${QUESTION}', '${CAROL}', 1, false)`);

  // Bob only ever reads his own rows, so he cannot see other people's activity
  // on the question he can no longer open.
  const asBob = await asRole('authenticated', BOB, `select id from answers where question_id = '${QUESTION}'`);
  assert.equal(asBob.rows.length, 1, 'his own answer and nothing else');

  const asCarol = await asRole('authenticated', CAROL, `select id from answers where question_id = '${QUESTION}'`);
  assert.equal(asCarol.rows.length, 1, 'the participant rule is unchanged');

  await db.query(`delete from answers where id = '66666666-6666-4666-8666-666666666666'`);
});

test('only the blocker can read or change their own block list', async () => {
  const asAlice = await asRole('authenticated', ALICE, 'select blocked_id from user_blocks');
  assert.deepEqual(
    asAlice.rows.map((row) => (row as { blocked_id: string }).blocked_id),
    [BOB],
    'the owner sees their own list',
  );

  const asBob = await asRole('authenticated', BOB, 'select blocker_id from user_blocks');
  assert.equal(asBob.rows.length, 0, 'the blocked user cannot see who blocked them');

  const asCarol = await asRole('authenticated', CAROL, 'select blocker_id, blocked_id from user_blocks');
  assert.equal(asCarol.rows.length, 0, 'nor can anybody else');

  // Someone else cannot delete the owner's block either.
  const foreignDelete = await asRole(
    'authenticated',
    CAROL,
    `delete from user_blocks where blocker_id = '${ALICE}'`,
  );
  assert.equal(foreignDelete.rows.length, 0);
  assert.equal(
    await count(`select count(*) as n from user_blocks where blocker_id = '${ALICE}'`),
    1,
    'and the block survived the attempt',
  );
});

test('blocking produces no notification and no stated reason', async () => {
  // Nothing that could surface as activity: no new answers, no reports, and no
  // follow quietly recreated in either direction.
  assert.equal(await count('select count(*) as n from answers'), 1, 'the seeded answer is untouched');
  assert.equal(await count('select count(*) as n from question_reports'), 0);
  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' or followee_id = '${BOB}'`),
    0,
    'no follow exists in either direction for the blocked user',
  );

  // The refusal copy and the trigger both stay silent about why.
  assert.doesNotMatch(FOLLOW_REFUSED_MESSAGE, /block/i);
  const { rows: triggers } = await db.query<{ prosrc: string }>(
    "select prosrc from pg_proc where proname = 'refuse_blocked_follow'",
  );
  assert.doesNotMatch(String(triggers[0]?.prosrc ?? ''), /you have been blocked/i);
});

test('existing question, answer, follow and profile behaviour survives the migration', async () => {
  await removeBlock();

  // The same two people can follow each other again once unblocked.
  await db.query(`insert into follows (follower_id, followee_id) values ('${BOB}', '${ALICE}')`);
  assert.equal(
    await count(`select count(*) as n from follows where follower_id = '${BOB}' and followee_id = '${ALICE}'`),
    1,
    'unblocking restores eligibility',
  );

  // Public questions and the answer-participant rule are unchanged.
  const publicQuestions = await asRole('authenticated', CAROL, 'select id from questions where is_public = true');
  assert.equal(publicQuestions.rows.length, 1);
  const carolAnswers = await asRole('authenticated', CAROL, 'select id from answers');
  assert.equal(carolAnswers.rows.length, 0, 'a non-participant still sees no answers');
  const bobAnswers = await asRole('authenticated', BOB, 'select id from answers');
  assert.equal(bobAnswers.rows.length, 1, 'a participant still sees their own');

  const profiles = await asRole('authenticated', BOB, 'select id from profiles where is_public = true');
  assert.equal(profiles.rows.length, 3, 'profile visibility is untouched');

  // The table's own constraints still hold.
  await assert.rejects(
    db.query(`insert into user_blocks (blocker_id, blocked_id) values ('${ALICE}', '${ALICE}')`),
    'self-blocking is refused by the CHECK constraint',
  );
  await addBlock();
  await assert.rejects(
    db.query(`insert into user_blocks (blocker_id, blocked_id) values ('${ALICE}', '${BOB}')`),
    'a duplicate block is refused by the primary key',
  );
  await removeBlock();
});
