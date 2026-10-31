import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

import { describeUnlistedCount, summarizeFollowList } from './follower-lists';

// --- What the cards decide to render ---------------------------------------

test('the owner sees listed and unlisted profiles, with no aggregate line', () => {
  // The owner's query has no is_public filter, so every row is visible and
  // nothing is withheld.
  const summary = summarizeFollowList({ visibleCount: 5, hiddenCount: 0 });
  assert.equal(summary.visibleCount, 5);
  assert.equal(summary.hiddenCount, 0);
  assert.equal(summary.total, 5);
  assert.equal(summary.unlistedLabel, null, 'the owner must never see the aggregate line');
  assert.equal(summary.isEmpty, false);
});

test('another viewer sees only listed profiles plus the withheld count', () => {
  const summary = summarizeFollowList({ visibleCount: 3, hiddenCount: 4 });
  assert.equal(summary.visibleCount, 3, 'only the listed profiles become rows');
  assert.equal(summary.hiddenCount, 4);
  assert.equal(summary.total, 7, 'the header keeps the true total');
  assert.equal(summary.unlistedLabel, '4 unlisted profiles');
});

test('followers and following are counted independently', () => {
  const followers = summarizeFollowList({ visibleCount: 2, hiddenCount: 1 });
  const following = summarizeFollowList({ visibleCount: 1, hiddenCount: 4 });

  assert.equal(followers.unlistedLabel, '1 unlisted profile');
  assert.equal(following.unlistedLabel, '4 unlisted profiles');
  assert.equal(followers.total, 3);
  assert.equal(following.total, 5);
  assert.notEqual(followers.hiddenCount, following.hiddenCount);
});

test('no withheld profiles produces no aggregate line', () => {
  assert.equal(summarizeFollowList({ visibleCount: 6, hiddenCount: 0 }).unlistedLabel, null);
  assert.equal(summarizeFollowList({ visibleCount: 0, hiddenCount: 0 }).unlistedLabel, null);
  assert.equal(describeUnlistedCount(0), null);
  assert.equal(describeUnlistedCount(-3), null);
});

test('a list of only unlisted profiles reveals no identities', () => {
  const summary = summarizeFollowList({ visibleCount: 0, hiddenCount: 4 });
  assert.equal(summary.visibleCount, 0, 'no row is rendered, so no name or handle leaks');
  assert.equal(summary.unlistedLabel, '4 unlisted profiles', 'only the count is shown');
  assert.equal(summary.isEmpty, false, 'the list is not empty, so the empty message is wrong');
  assert.equal(summary.total, 4);
});

test('a genuinely empty list still shows the empty message and no aggregate', () => {
  const summary = summarizeFollowList({ visibleCount: 0, hiddenCount: 0 });
  assert.equal(summary.isEmpty, true);
  assert.equal(summary.total, 0);
  assert.equal(summary.unlistedLabel, null);
});

test('the label is singular for one withheld profile and refuses nonsense', () => {
  assert.equal(describeUnlistedCount(1), '1 unlisted profile');
  assert.equal(describeUnlistedCount(2), '2 unlisted profiles');
  assert.equal(describeUnlistedCount(1.5), null);
});

// --- That the underlying table cannot leak the hidden identities ------------

const OWNER = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const LISTED_FOLLOWER = '33333333-3333-4333-8333-333333333333';
const UNLISTED_FOLLOWER = '44444444-4444-4444-8444-444444444444';
const UNLISTED_FOLLOWEE = '55555555-5555-4555-8555-555555555555';

// Mirrors the RLS in SUPABASE_SETUP.md for exactly these two tables.
const SCHEMA = `
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
  is_public boolean not null default true
);

create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

alter table profiles enable row level security;
alter table follows enable row level security;

create policy "Public profiles are readable"
  on profiles for select using (is_public = true or auth.uid() = id);
create policy "Users can read their follows"
  on follows for select using (auth.uid() = follower_id or auth.uid() = followee_id);

grant select on public.follows to anon, authenticated;
grant select (id, username, display_name, bio, is_public) on public.profiles to anon, authenticated;
`;

const SEED = `
insert into profiles (id, email, username, is_public) values
  ('${OWNER}', 'owner@example.test', 'owner', true),
  ('${VIEWER}', 'viewer@example.test', 'viewer', true),
  ('${LISTED_FOLLOWER}', 'listed@example.test', 'listed', true),
  ('${UNLISTED_FOLLOWER}', 'hidden@example.test', 'hidden', false),
  ('${UNLISTED_FOLLOWEE}', 'shy@example.test', 'shy', false);

insert into follows (follower_id, followee_id) values
  ('${LISTED_FOLLOWER}', '${OWNER}'),
  ('${UNLISTED_FOLLOWER}', '${OWNER}'),
  ('${OWNER}', '${UNLISTED_FOLLOWEE}');
`;

async function asViewer(db: PGlite, sql: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [VIEWER]);
  await db.exec('set role authenticated');
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec('reset role');
  }
}

test('hidden follower and following identities cannot be read from the underlying tables', async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);

  // Exactly what a direct browser/PostgREST call could ask for. The viewer is
  // not a participant in either edge, so the policy hides the whole set.
  const followers = await asViewer(db, `select follower_id from follows where followee_id = '${OWNER}'`);
  assert.equal(followers.rows.length, 0, 'another viewer must not read the owner follow edges');

  const following = await asViewer(db, `select followee_id from follows where follower_id = '${OWNER}'`);
  assert.equal(following.rows.length, 0);

  // Nor can the unlisted profiles be resolved directly.
  const hiddenProfile = await asViewer(db, `select id, username from profiles where id = '${UNLISTED_FOLLOWER}'`);
  assert.equal(hiddenProfile.rows.length, 0, 'an unlisted profile is invisible to another viewer');

  // The feature is not simply broken: listed profiles remain readable.
  const listedProfile = await asViewer(db, `select id, username from profiles where id = '${LISTED_FOLLOWER}'`);
  assert.equal(listedProfile.rows.length, 1);

  // The profile page runs as the service role, which is how the owner's full
  // list and the withheld count are produced - server-side only.
  const asService = await db.query<{ n: string }>(
    `select count(*) as n from follows where followee_id = '${OWNER}'`,
  );
  assert.equal(Number(asService.rows[0].n), 2);
});
