-- P1: run AFTER P0 CLEANUP and BEFORE deploying the P1 application.
-- One migration only. No P1 cleanup step or new environment variables are required.
begin;

do $$
begin
  if to_regclass('public.question_secrets') is null
    or exists (select 1 from pg_attribute where attrelid = 'public.questions'::regclass
      and attname in ('correct_answer', 'correct_answer_index') and not attisdropped) then
    raise exception 'Complete P0 PREPARE, deploy, and CLEANUP before applying P1.';
  end if;
end;
$$;

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
commit;
