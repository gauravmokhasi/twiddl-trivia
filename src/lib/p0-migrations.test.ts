import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const authorId = '11111111-1111-4111-8111-111111111111';
const viewerId = '22222222-2222-4222-8222-222222222222';
const legacyId = '33333333-3333-4333-8333-333333333333';
// A legacy schema with the original RLS and Supabase browser/service roles.
const legacySchema = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table profiles (id uuid primary key);
insert into profiles values ('${authorId}'), ('${viewerId}');
create table questions (
  id uuid primary key default gen_random_uuid(), author_id uuid references profiles(id),
  text text not null, choices text[] not null, correct_answer_index int not null,
  question_type text not null default 'multiple_choice', correct_answer text,
  is_public boolean not null default true, created_at timestamptz not null default now()
);
create table answers (
  id uuid primary key default gen_random_uuid(), question_id uuid references questions(id) on delete cascade,
  responder_id uuid references profiles(id), selected_choice_index int, answer_text text,
  is_correct boolean not null, created_at timestamptz not null default now(), unique(question_id, responder_id)
);
alter table questions enable row level security; alter table answers enable row level security;
create policy "Questions are readable" on questions for select using (is_public or auth.uid() = author_id);
create policy "Users can create their own questions" on questions for insert with check (auth.uid() = author_id);
create policy "Answers are readable by participants" on answers for select using (auth.uid() = responder_id or exists(select 1 from questions q where q.id = question_id and q.author_id = auth.uid()));
create policy "Users can create their own answers" on answers for insert with check (auth.uid() = responder_id);
grant all on all tables in schema public to anon, authenticated, service_role;
-- Also seed a column grant; revoking table grants alone must not leave this loophole behind.
grant insert(is_correct), update(is_correct) on answers to authenticated;
`;
// 'correct_answer' belongs to questions, so seed its SELECT grant separately.
const fixture = legacySchema
  + `grant select(correct_answer) on questions to authenticated;
insert into questions (id, author_id, text, choices, correct_answer_index)
values ('${legacyId}', '${authorId}', 'Capital?', array['Paris','London'], 0);
insert into questions (author_id, text, choices, question_type, correct_answer_index, correct_answer)
values ('${authorId}', 'Naturalist?', '{}', 'free_text', -1, 'Charles Darwin, Darwin');`;

async function asRole(db: PGlite, role: string, sql: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [role === 'authenticated' ? viewerId : '']);
  await db.exec(`set role ${role}`);
  try { return await db.query<Record<string, unknown>>(sql); }
  finally { await db.exec('reset role'); }
}

async function createQuestion(db: PGlite, type = 'multiple_choice', answer = 'null') {
  const { rows } = await asRole(db, 'service_role', `select public.create_question_with_secret(
    '${authorId}', 'Question?', ${type === 'multiple_choice' ? "array['A','B']" : "'{}'::text[]"},
    '${type}', true, ${type === 'multiple_choice' ? '1' : 'null'}, ${answer}) as question`);
  return rows[0].question as { id: string; [key: string]: unknown };
}

test('P0 staged migrations enforce the boundary through real PostgreSQL permissions', async (t) => {
  const prepare = await readFile('supabase/migrations/202610070001_p0_prepare.sql', 'utf8');
  const cleanup = await readFile('supabase/migrations/202610070002_p0_cleanup.sql', 'utf8');
  const db = new PGlite();
  try {
    await db.exec(fixture);
    await db.exec(prepare);
    await db.query<Record<string, unknown>>("select set_config('request.jwt.claim.sub', $1, false)", [viewerId]);

    await t.test('backfills MCQ and free-text keys without granting clients access', async () => {
      const { rows } = await asRole(db, 'service_role', 'select * from question_secrets order by correct_answer_index nulls last');
      assert.equal(rows.length, 2);
      assert.equal(rows[0].correct_answer_index, 0);
      assert.equal(rows[1].correct_answer_index, null);
      assert.equal(rows[1].correct_answer, 'Charles Darwin, Darwin');
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(asRole(db, role, 'select * from question_secrets'), /permission denied/);
        await assert.rejects(asRole(db, role, 'select correct_answer_index, correct_answer from questions'), /permission denied/);
        assert.equal((await asRole(db, role, 'select id, text, choices from questions')).rows.length, 2);
      }
    });

    await t.test('clients cannot forge answers, update grades, insert questions or call the RPC', async () => {
      for (const role of ['anon', 'authenticated']) {
        await assert.rejects(asRole(db, role, `insert into answers(question_id,responder_id,is_correct) values('${legacyId}','${viewerId}',true)`), /permission denied/);
        await assert.rejects(asRole(db, role, 'update answers set is_correct = true'), /permission denied/);
        await assert.rejects(asRole(db, role, `insert into questions(author_id,text,choices,correct_answer_index) values('${viewerId}','Bypass','{}',0)`), /permission denied/);
        await assert.rejects(asRole(db, role, `select create_question_with_secret('${viewerId}','Bypass',array['A','B'],'multiple_choice',true,0,null)`), /permission denied/);
      }
    });

    await t.test('old server writes during rollout synchronize their keys', async () => {
      const { rows } = await asRole(db, 'service_role', `insert into questions(author_id,text,choices,correct_answer_index) values('${authorId}','Old deployment',array['A','B'],1) returning id`);
      const { rows: secrets } = await db.query<Record<string, unknown>>('select * from question_secrets where question_id = $1', [rows[0].id]);
      assert.equal(secrets[0].correct_answer_index, 1);
    });

    await t.test('new server creates both types before cleanup without legacy answer fields in the response', async () => {
      const question = await createQuestion(db);
      assert.equal('correct_answer_index' in question, false);
      assert.equal('correct_answer' in question, false);
      assert.equal((await db.query<Record<string, unknown>>('select correct_answer_index from questions where id = $1', [question.id])).rows[0].correct_answer_index, 1);
      assert.equal((await db.query<Record<string, unknown>>('select correct_answer_index from question_secrets where question_id = $1', [question.id])).rows[0].correct_answer_index, 1);
      await createQuestion(db, 'free_text', "'Darwin'");
    });

    await t.test('failure storing a key rolls back the public question too', async () => {
      await db.exec(`create function fail_test_key() returns trigger language plpgsql as $$ begin if new.correct_answer = 'Force failure' then raise exception 'Test key failure'; end if; return new; end $$;
        create trigger fail_test_key before insert on question_secrets for each row execute function fail_test_key();`);
      const before = (await db.query<Record<string, unknown>>('select count(*)::int as total from questions')).rows[0].total;
      await assert.rejects(createQuestion(db, 'free_text', "'Force failure'"), /Test key failure/);
      assert.equal((await db.query<Record<string, unknown>>('select count(*)::int as total from questions')).rows[0].total, before);
      await db.exec('drop trigger fail_test_key on question_secrets; drop function fail_test_key();');
    });

    await t.test('cleanup refuses missing keys and leaves legacy columns intact', async () => {
      const question = await createQuestion(db);
      const saved = (await db.query<Record<string, unknown>>('select * from question_secrets where question_id = $1', [question.id])).rows[0];
      await db.query<Record<string, unknown>>('delete from question_secrets where question_id = $1', [question.id]);
      await assert.rejects(db.exec(cleanup), /Missing or invalid/);
      await db.exec('rollback');
      await db.query<Record<string, unknown>>('select correct_answer_index from questions limit 1');
      await db.query<Record<string, unknown>>('insert into question_secrets values ($1,$2,$3)', [saved.question_id, saved.correct_answer_index, saved.correct_answer]);
    });

    await t.test('cleanup removes legacy columns; new writes, participant reads and cascading deletion still work', async () => {
      await db.exec(cleanup);
      await assert.rejects(db.query<Record<string, unknown>>('select correct_answer_index from questions'), /does not exist/);
      const question = await createQuestion(db);
      await createQuestion(db, 'free_text', "'Darwin'");
      await asRole(db, 'service_role', `insert into answers(question_id,responder_id,selected_choice_index,is_correct) values('${question.id}','${viewerId}',1,true)`);
      assert.equal((await asRole(db, 'authenticated', 'select is_correct from answers')).rows[0].is_correct, true);
      assert.equal((await asRole(db, 'anon', 'select * from answers')).rows.length, 0);
      await asRole(db, 'service_role', `delete from questions where id = '${question.id}'`);
      assert.equal((await db.query<Record<string, unknown>>('select * from question_secrets where question_id = $1', [question.id])).rows.length, 0);
      assert.equal((await db.query<Record<string, unknown>>('select * from answers where question_id = $1', [question.id])).rows.length, 0);
    });
  } finally { await db.close(); }
});
