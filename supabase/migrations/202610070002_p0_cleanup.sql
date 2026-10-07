-- CLEANUP: run ONLY AFTER the P0 application is deployed and its production smoke tests pass.
-- Never apply both migrations with an unattended `supabase db push` during the staged rollout.
-- Old deployments will no longer work after this file. Roll back only to P0-compatible code.
begin;
lock table public.questions in share row exclusive mode;

-- Refuse cleanup if even one question is missing a valid, type-compatible private key.
do $$
begin
  if exists (
    select 1 from public.questions q left join public.question_secrets s on s.question_id = q.id
    where s.question_id is null
      or q.question_type not in ('multiple_choice', 'free_text')
      or (q.question_type = 'multiple_choice' and (s.correct_answer_index is null
        or s.correct_answer_index < 0 or s.correct_answer_index >= cardinality(q.choices) or s.correct_answer is not null))
      or (q.question_type = 'free_text' and (s.correct_answer_index is not null
        or s.correct_answer is null or length(btrim(s.correct_answer)) = 0))
  ) then
    raise exception 'Missing or invalid question_secrets; investigate before cleanup.';
  end if;
end;
$$;

drop trigger p0_sync_legacy_question_secret on public.questions;
drop function public.p0_sync_legacy_question_secret();
alter table public.questions drop column correct_answer_index;
alter table public.questions drop column correct_answer;
-- Replace the transitional writer; the permanent function references only the final schema.
create or replace function public.create_question_with_secret(
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

  insert into public.questions (author_id, text, choices, question_type, is_public)
  values (p_author_id, btrim(p_text), p_choices, p_question_type, p_is_public)
  returning * into created;
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
