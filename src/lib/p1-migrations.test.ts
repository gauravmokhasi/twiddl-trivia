import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const viewerId = '22222222-2222-4222-8222-222222222222';
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table profiles (id uuid primary key default gen_random_uuid(), email text unique not null,
  username text unique not null, display_name text, bio text, is_public boolean not null default true,
  created_at timestamptz not null default now());
insert into profiles (id,email,username) values ('${viewerId}','viewer@example.test','viewer');
alter table profiles enable row level security;
create policy "Public profiles are readable" on profiles for select using (is_public or auth.uid() = id);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create table questions (id uuid primary key default gen_random_uuid(), author_id uuid not null references profiles(id),
  text text not null, choices text[] not null, question_type text not null default 'multiple_choice',
  is_public boolean not null default true, created_at timestamptz not null default now());
create table question_secrets (question_id uuid primary key references questions(id) on delete cascade,
  correct_answer_index int, correct_answer text,
  constraint question_secrets_one_key check ((correct_answer_index is not null and correct_answer_index >= 0 and correct_answer is null)
    or (correct_answer_index is null and correct_answer is not null and length(btrim(correct_answer)) > 0)));
create table answers (id uuid primary key default gen_random_uuid(), question_id uuid not null references questions(id) on delete cascade,
  responder_id uuid not null references profiles(id), selected_choice_index int, answer_text text,
  is_correct boolean not null, created_at timestamptz not null default now(), unique(question_id,responder_id));
alter table questions enable row level security; alter table question_secrets enable row level security; alter table answers enable row level security;
create policy "Questions are readable" on questions for select using (is_public or auth.uid() = author_id);
grant all on all tables in schema public to service_role;
grant all on profiles to public, anon, authenticated;
-- An explicit column grant must be removed along with the vulnerable table SELECT grant.
grant select(email) on profiles to authenticated;
grant select(id,author_id,text,choices,question_type,is_public,created_at) on questions to anon,authenticated;
`;

async function newAuthor(db: PGlite) {
  const { rows } = await db.query<{ id: string }>(`insert into profiles(email,username)
    values(gen_random_uuid()::text || '@example.test', gen_random_uuid()::text) returning id`);
  return rows[0].id;
}

async function asRole(db: PGlite, role: string, sql: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [role === 'authenticated' ? viewerId : '']);
  await db.exec(`set role ${role}`);
  try { return await db.query<Record<string, unknown>>(sql); }
  finally { await db.exec('reset role'); }
}

function questionCall(authorId: string, type = 'multiple_choice', answer = 'null') {
  return `select create_question_with_secret('${authorId}', 'Question?',
    ${type === 'multiple_choice' ? "array['A','B']" : "'{}'::text[]"}, '${type}', true,
    ${type === 'multiple_choice' ? '1' : 'null'}, ${answer}) as question`;
}

test('P1 SQL protects email, enforces rolling posting limits and aggregates full profiles', async (t) => {
  const migration = await readFile('supabase/migrations/202610070003_p1_privacy_and_integrity.sql', 'utf8');
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(migration);

    await t.test('both browser roles can read safe profiles, but cannot request or filter on email', async () => {
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await asRole(db, role, 'select id,username,display_name,bio,is_public,created_at from profiles')).rows.length, 1);
        await assert.rejects(asRole(db, role, 'select email from profiles'), /permission denied/);
        await assert.rejects(asRole(db, role, 'select * from profiles'), /permission denied/);
        await assert.rejects(asRole(db, role, "select username from profiles where email = 'viewer@example.test'"), /permission denied/);
      }
      const { rows } = await asRole(db, 'service_role', `update profiles set email = 'synced@example.test'
        where id = '${viewerId}' returning email`);
      assert.equal(rows[0].email, 'synced@example.test');
    });

    await t.test('email restrictions preserve public/owner RLS and do not list unlisted profiles', async () => {
      await db.query('update profiles set is_public = false where id = $1', [viewerId]);
      assert.equal((await asRole(db, 'anon', 'select username from profiles')).rows.length, 0);
      assert.equal((await asRole(db, 'authenticated', 'select username from profiles')).rows.length, 1);
      await assert.rejects(asRole(db, 'authenticated', 'select email from profiles'), /permission denied/);
      await db.query('update profiles set is_public = true where id = $1', [viewerId]);
    });

    await t.test('same-author competing requests save exactly one public question and private key', async () => {
      const author = await newAuthor(db);
      await db.exec('set role service_role');
      // PGlite queues these calls on one backend. Multi-connection lock contention is a live smoke test.
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => db.query(questionCall(author))));
      await db.exec('reset role');
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      for (const result of results) {
        if (result.status === 'rejected') assert.equal(result.reason.code, 'TWD01');
      }
      assert.equal((await db.query<{ total: number }>('select count(*)::int as total from questions where author_id = $1', [author])).rows[0].total, 1);
      assert.equal((await db.query<{ total: number }>('select count(*)::int as total from question_secrets s join questions q on q.id = s.question_id where q.author_id = $1', [author])).rows[0].total, 1);
      const anotherAuthor = await newAuthor(db);
      await asRole(db, 'service_role', questionCall(anotherAuthor, 'free_text', "'Darwin'"));
    });

    await t.test('the author advisory lock is held through the transaction and released at its end', async () => {
      const author = await newAuthor(db);
      const secondAuthor = await newAuthor(db);
      const before = (await db.query<{ total: number }>("select count(*)::int as total from pg_locks where locktype = 'advisory'")).rows[0].total;
      await db.transaction(async (tx) => {
        await tx.exec('set local role service_role');
        await tx.query(questionCall(author));
        await tx.query(questionCall(secondAuthor));
        const held = (await tx.query<{ total: number }>("select count(*)::int as total from pg_locks where locktype = 'advisory' and granted")).rows[0].total;
        assert.equal(held, before + 2);
      });
      assert.equal((await db.query<{ total: number }>("select count(*)::int as total from pg_locks where locktype = 'advisory'")).rows[0].total, before);
    });

    await t.test('a question just inside 24 hours blocks posting; a question at the boundary permits it', async () => {
      const recentAuthor = await newAuthor(db);
      await db.query("insert into questions(author_id,text,choices,created_at) values($1,'Earlier',array['A','B'],clock_timestamp()-interval '23 hours')", [recentAuthor]);
      await assert.rejects(asRole(db, 'service_role', questionCall(recentAuthor)), (error: unknown) => (error as { code: string }).code === 'TWD01');
      const oldAuthor = await newAuthor(db);
      await db.query("insert into questions(author_id,text,choices,created_at) values($1,'Earlier',array['A','B'],clock_timestamp()-interval '24 hours')", [oldAuthor]);
      await asRole(db, 'service_role', questionCall(oldAuthor));
    });

    await t.test('a failed key insert saves no public question and consumes no posting allowance', async () => {
      const author = await newAuthor(db);
      await db.exec(`create function reject_test_key() returns trigger language plpgsql as $$ begin
        if new.correct_answer = 'Reject key' then raise exception 'Test key failure'; end if; return new; end $$;
        create trigger reject_test_key before insert on question_secrets for each row execute function reject_test_key();`);
      await assert.rejects(asRole(db, 'service_role', questionCall(author, 'free_text', "'Reject key'")), /Test key failure/);
      assert.equal((await db.query<{ total: number }>('select count(*)::int as total from questions where author_id = $1', [author])).rows[0].total, 0);
      await asRole(db, 'service_role', questionCall(author, 'free_text', "'Darwin'"));
      await db.exec('drop trigger reject_test_key on question_secrets; drop function reject_test_key();');
    });

    await t.test('counts span 45 archived questions, both visibility values and every archive page', async () => {
      const author = await newAuthor(db);
      await db.query(`insert into questions(author_id,text,choices,is_public,created_at)
        select $1, 'Archived ' || n, array['A','B'], n % 3 <> 0, now() - n * interval '1 day'
        from generate_series(1,45) n`, [author]);
      await db.query('insert into question_secrets(question_id,correct_answer_index) select id,1 from questions where author_id = $1', [author]);
      await db.query(`insert into answers(question_id,responder_id,selected_choice_index,is_correct)
        select id,$2,1,true from questions where author_id = $1 order by created_at limit 31`, [author, viewerId]);
      const { rows } = await asRole(db, 'service_role', `select * from profile_question_counts('${author}','${viewerId}')`);
      assert.equal(Number(rows[0].total_questions), 45);
      assert.equal(Number(rows[0].unanswered_questions), 14);
      const { rows: playable } = await db.query<{ total: number }>(`select count(*)::int as total from questions q
        where author_id = $1 and author_id <> $2 and not exists (select 1 from answers a where a.question_id=q.id and a.responder_id=$2)`, [author, viewerId]);
      assert.equal(Number(rows[0].unanswered_questions), playable[0].total);
      const { rows: owner } = await asRole(db, 'service_role', `select * from profile_question_counts('${author}','${author}')`);
      assert.equal(Number(owner[0].unanswered_questions), 0);
      const { rows: guest } = await asRole(db, 'service_role', `select * from profile_question_counts('${author}',null)`);
      assert.equal(Number(guest[0].unanswered_questions), 0);
      await db.query(`insert into answers(question_id,responder_id,selected_choice_index,is_correct)
        select q.id,$2,0,false from questions q where q.author_id = $1
        and not exists(select 1 from answers a where a.question_id=q.id and a.responder_id=$2)`, [author, viewerId]);
      assert.equal(Number((await asRole(db, 'service_role', `select * from profile_question_counts('${author}','${viewerId}')`)).rows[0].unanswered_questions), 0);
    });

    await t.test('neither browser role can call the writer or read service-only profile counts', async () => {
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(asRole(db, role, questionCall(viewerId)), /permission denied/);
        await assert.rejects(asRole(db, role, `select * from profile_question_counts('${viewerId}','${viewerId}')`), /permission denied/);
        await assert.rejects(asRole(db, role, 'select * from question_secrets'), /permission denied/);
      }
    });
  } finally { await db.close(); }
});

test('P1 refuses an incomplete P0 rollout before changing any permissions', async () => {
  const migration = await readFile('supabase/migrations/202610070003_p1_privacy_and_integrity.sql', 'utf8');
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec('alter table questions add column correct_answer_index int');
    await assert.rejects(db.exec(migration), /Complete P0/);
    await db.exec('rollback');
    assert.equal((await asRole(db, 'anon', 'select email from profiles')).rows[0].email, 'viewer@example.test');
  } finally { await db.close(); }
});
