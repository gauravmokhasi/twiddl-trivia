-- PREPARE: run on the existing production schema BEFORE deploying the P0 application.
-- Do not run CLEANUP in the same step. This file is transactional and fails without partial changes.
-- The old deployment still serializes keys: deploy the new code promptly after PREPARE.
begin;

-- Block concurrent legacy writes while backfilling and installing the compatibility trigger.
lock table public.questions in share row exclusive mode;

create table public.question_secrets (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_answer_index int,
  correct_answer text,
  constraint question_secrets_one_key check (
    (correct_answer_index is not null and correct_answer_index >= 0 and correct_answer is null)
    or (correct_answer_index is null and correct_answer is not null and length(btrim(correct_answer)) > 0)
  )
);
alter table public.question_secrets enable row level security;
revoke all privileges on public.question_secrets from public, anon, authenticated;
grant all privileges on public.question_secrets to service_role;

-- Legacy free-text rows use -1 as the unused index. The private table uses NULL instead.
insert into public.question_secrets (question_id, correct_answer_index, correct_answer)
select id,
  case when question_type = 'multiple_choice' then correct_answer_index else null end,
  case when question_type = 'free_text' then correct_answer else null end
from public.questions;

-- New code writes no legacy key; old code can still insert its legacy key until CLEANUP.
alter table public.questions alter column correct_answer_index drop not null;
create function public.p0_sync_legacy_question_secret()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.question_type = 'multiple_choice' and new.correct_answer_index is not null then
    insert into public.question_secrets (question_id, correct_answer_index, correct_answer)
    values (new.id, new.correct_answer_index, null)
    on conflict (question_id) do update set correct_answer_index = excluded.correct_answer_index, correct_answer = null;
  elsif new.question_type = 'free_text' and new.correct_answer is not null then
    insert into public.question_secrets (question_id, correct_answer_index, correct_answer)
    values (new.id, null, new.correct_answer)
    on conflict (question_id) do update set correct_answer_index = null, correct_answer = excluded.correct_answer;
  end if;
  return new;
end;
$$;
revoke all on function public.p0_sync_legacy_question_secret() from public, anon, authenticated;
grant execute on function public.p0_sync_legacy_question_secret() to service_role;
create trigger p0_sync_legacy_question_secret
  after insert or update of correct_answer_index, correct_answer, question_type on public.questions
  for each row execute function public.p0_sync_legacy_question_secret();

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

-- A single transaction persists the public question and private key, with no orphan on failure.
-- SECURITY INVOKER: only service_role has EXECUTE and the required table permissions.
-- The rolling daily-limit race is intentionally left for P1; keep the API's existing check.
create function public.create_question_with_secret(
  p_author_id uuid, p_text text, p_choices text[], p_question_type text,
  p_is_public boolean, p_correct_answer_index int, p_correct_answer text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare created public.questions;
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

  -- Dual-write legacy keys during PREPARE so old in-flight server requests can still grade
  -- questions created by the new deployment. The keys remain hidden by the column grants.
  -- Dynamic SQL avoids a dependency on legacy columns after CLEANUP drops them.
  if exists (select 1 from pg_attribute where attrelid = 'public.questions'::regclass
    and attname = 'correct_answer_index' and not attisdropped) then
    execute 'insert into public.questions (author_id, text, choices, question_type, is_public, correct_answer_index, correct_answer)
      values ($1, $2, $3, $4, $5, $6, $7) returning *'
      into created using p_author_id, btrim(p_text), p_choices, p_question_type, p_is_public,
        coalesce(p_correct_answer_index, -1), p_correct_answer;
  else
    insert into public.questions (author_id, text, choices, question_type, is_public)
    values (p_author_id, btrim(p_text), p_choices, p_question_type, p_is_public)
    returning * into created;
  end if;
  insert into public.question_secrets (question_id, correct_answer_index, correct_answer)
  values (created.id, p_correct_answer_index, p_correct_answer)
  on conflict (question_id) do update set
    correct_answer_index = excluded.correct_answer_index, correct_answer = excluded.correct_answer;
  -- An allowlist also keeps legacy keys out of the RPC response during PREPARE.
  return jsonb_build_object('id', created.id, 'author_id', created.author_id, 'text', created.text,
    'choices', created.choices, 'question_type', created.question_type,
    'is_public', created.is_public, 'created_at', created.created_at);
end;
$$;
revoke all on function public.create_question_with_secret(uuid, text, text[], text, boolean, int, text)
  from public, anon, authenticated;
grant execute on function public.create_question_with_secret(uuid, text, text[], text, boolean, int, text)
  to service_role;
notify pgrst, 'reload schema';
commit;
