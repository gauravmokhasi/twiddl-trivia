-- P2: private user blocking.
--
-- One row means "blocker_id has blocked blocked_id". The relationship is private
-- to the blocker (RLS), and it is enforced in the database as well as in the app,
-- because Twiddl reads most content through the service-role client, which
-- bypasses RLS.
--
-- Semantics implemented here:
--   * Creating a block deletes any follow the blocked user had on the blocker.
--   * A blocked user can never insert or update a follow onto the blocker.
--   * Deleting a block does NOT restore that follow (deliberately, no trigger).

begin;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_id_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Only the user who created a block may see, create or remove it. There is no
-- UPDATE policy: a block is immutable apart from being deleted.
revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;

drop policy if exists "Users can read their own blocks" on public.user_blocks;
create policy "Users can read their own blocks"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "Users can create their own blocks" on public.user_blocks;
create policy "Users can create their own blocks"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- Blocking drops the existing follow in both directions:
--   * blocked -> blocker (the blocked user's follow on the blocker)
--   * blocker -> blocked (the blocker's follow on the blocked user)
-- security definer so the cleanup happens whoever performs the insert; without
-- it a browser-role insert could not delete another user's follow row under the
-- existing follows DELETE policy (auth.uid() = follower_id).
-- Deliberately NOT created on delete: unblocking must not recreate a follow.
-- ---------------------------------------------------------------------------
create or replace function public.remove_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.follows
  where follower_id = NEW.blocked_id
    and followee_id = NEW.blocker_id;
  delete from public.follows
  where follower_id = NEW.blocker_id
    and followee_id = NEW.blocked_id;
  return NEW;
end;
$$;

drop trigger if exists user_blocks_remove_follows on public.user_blocks;
create trigger user_blocks_remove_follows
  after insert on public.user_blocks
  for each row execute function public.remove_follows_on_block();

-- ---------------------------------------------------------------------------
-- The blocked user can never (re)create a follow onto the blocker.
-- security definer because the policy on user_blocks would otherwise hide the
-- blocker's block list from this check. The function only ever raises; it never
-- modifies data.
-- ---------------------------------------------------------------------------
create or replace function public.refuse_blocked_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.user_blocks b
    where b.blocker_id = NEW.followee_id
      and b.blocked_id = NEW.follower_id
  ) then
    -- Deliberately uninformative: the reason must never reach the caller.
    raise exception 'follow refused' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists follows_refuse_blocked on public.follows;
create trigger follows_refuse_blocked
  before insert or update on public.follows
  for each row execute function public.refuse_blocked_follow();

-- ---------------------------------------------------------------------------
-- Browser roles can read questions straight from PostgREST using the anon key,
-- so question visibility is also enforced in RLS, not only in app queries.
-- The helper is security definer (user_blocks is private to the blocker) and is
-- anchored on auth.uid(), so its answer is exactly the answer the policy itself
-- would give: it cannot be used to inspect anyone else's block list.
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_from(p_blocker uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_blocks b
    where b.blocker_id = p_blocker
      and b.blocked_id = auth.uid()
  );
$$;

grant execute on function public.is_blocked_from(uuid) to anon, authenticated, service_role;

-- Preserves the existing public/private rule, and additionally withholds
-- questions whose author has blocked the viewer.
drop policy if exists "Questions are readable" on public.questions;
create policy "Questions are readable"
  on questions for select using (
    (is_public = true or auth.uid() = author_id)
    and not public.is_blocked_from(author_id)
  );

notify pgrst, 'reload schema';
commit;
