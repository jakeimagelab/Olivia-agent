-- 사진선택 접근 방식 전환을 데이터 손실 없이 검증하고 변경 이력을 남긴다.

create extension if not exists pgcrypto;

create table if not exists public.person_select_access_mode_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  from_mode text not null,
  to_mode text not null,
  confirmed boolean not null default false,
  actor text not null default 'admin_session',
  impact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_mode in ('individual', 'project_shared')),
  check (to_mode in ('individual', 'project_shared')),
  check (from_mode <> to_mode)
);

create index if not exists person_select_access_mode_changes_event_created_idx
  on public.person_select_access_mode_changes(event_id, created_at desc);

alter table public.person_select_access_mode_changes enable row level security;
drop policy if exists "service role full access person_select_access_mode_changes" on public.person_select_access_mode_changes;
create policy "service role full access person_select_access_mode_changes"
  on public.person_select_access_mode_changes for all to service_role using (true) with check (true);

create or replace function public.person_select_access_mode_facts(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with people_facts as (
    select
      count(*)::integer as people_count,
      count(*) filter (where first_seen_at is not null or last_seen_at is not null)::integer as accessed_people_count,
      count(*) filter (where submitted_at is not null)::integer as submitted_people_count,
      count(*) filter (where jsonb_array_length(coalesce(orders, '[]'::jsonb)) > 0)::integer as order_people_count
    from public.person_select_people
    where event_id = p_event_id
  ), image_facts as (
    select
      count(*)::integer as image_count,
      count(*) filter (where category_key <> 'homeroom' and owner_person_id is not null)::integer as owned_image_count,
      count(*) filter (where category_key = 'homeroom' and nullif(btrim(owner_group), '') is not null)::integer as group_image_count,
      count(*) filter (where
        (category_key = 'homeroom' and nullif(btrim(owner_group), '') is null)
        or (category_key <> 'homeroom' and owner_person_id is null)
      )::integer as unassigned_image_count,
      count(distinct owner_person_id) filter (
        where category_key <> 'homeroom' and owner_person_id is not null and not exists (
          select 1 from public.person_select_people person
          where person.id = person_select_images.owner_person_id
            and person.event_id = p_event_id
            and nullif(btrim(person.pin_code), '') is not null
        )
      )::integer as owners_without_pin_count,
      count(distinct owner_group) filter (
        where category_key = 'homeroom' and nullif(btrim(owner_group), '') is not null and not exists (
          select 1 from public.person_select_people person
          where person.event_id = p_event_id
            and person.group_label = person_select_images.owner_group
            and nullif(btrim(person.pin_code), '') is not null
        )
      )::integer as groups_without_eligible_people_count
    from public.person_select_images
    where event_id = p_event_id
  )
  select jsonb_build_object(
    'peopleCount', people_facts.people_count,
    'imageCount', image_facts.image_count,
    'choiceCount', (select count(*)::integer from public.person_select_choices where event_id = p_event_id),
    'sharedDraftCount', (select count(*)::integer from public.person_select_shared_drafts where event_id = p_event_id),
    'sharedSelectionCount', (select count(*)::integer from public.person_select_shared_selections where event_id = p_event_id),
    'accessedPeopleCount', people_facts.accessed_people_count,
    'submittedPeopleCount', people_facts.submitted_people_count,
    'orderPeopleCount', people_facts.order_people_count,
    'ownedImageCount', image_facts.owned_image_count,
    'groupImageCount', image_facts.group_image_count,
    'unassignedImageCount', image_facts.unassigned_image_count,
    'ownersWithoutPinCount', image_facts.owners_without_pin_count,
    'groupsWithoutEligiblePeopleCount', image_facts.groups_without_eligible_people_count
  )
  from people_facts cross join image_facts;
$$;

revoke all on function public.person_select_access_mode_facts(uuid) from public, anon, authenticated;
grant execute on function public.person_select_access_mode_facts(uuid) to service_role;

create or replace function public.apply_person_select_access_mode_change(
  p_event_id uuid,
  p_expected_mode text,
  p_next_mode text,
  p_expected_facts jsonb,
  p_confirmed boolean,
  p_shared_token text,
  p_actor text default 'admin_session'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_event public.person_select_events%rowtype;
  updated_event public.person_select_events%rowtype;
  current_facts jsonb;
begin
  if p_expected_mode not in ('individual', 'project_shared') or p_next_mode not in ('individual', 'project_shared') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ACCESS_MODE', 'error', '올바른 접근 방식을 선택해 주세요.');
  end if;

  select * into current_event from public.person_select_events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'EVENT_NOT_FOUND', 'error', '프로젝트를 찾을 수 없습니다.');
  end if;
  if current_event.access_mode <> p_expected_mode then
    return jsonb_build_object('ok', false, 'code', 'ACCESS_MODE_STATE_CHANGED', 'error', '다른 화면에서 접근 방식이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
  end if;

  current_facts := public.person_select_access_mode_facts(p_event_id);
  if current_facts <> coalesce(p_expected_facts, '{}'::jsonb) then
    return jsonb_build_object('ok', false, 'code', 'ACCESS_MODE_STATE_CHANGED', 'error', '사진 또는 고객 활동 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.', 'facts', current_facts);
  end if;

  update public.person_select_events
  set access_mode = p_next_mode,
      shared_token = case
        when p_next_mode = 'project_shared' then coalesce(shared_token, nullif(p_shared_token, ''))
        else shared_token
      end,
      shared_link_active = (p_next_mode = 'project_shared'),
      updated_at = now()
  where id = p_event_id
  returning * into updated_event;

  insert into public.person_select_access_mode_changes(event_id, from_mode, to_mode, confirmed, actor, impact)
  values (p_event_id, p_expected_mode, p_next_mode, coalesce(p_confirmed, false), coalesce(nullif(p_actor, ''), 'admin_session'), current_facts);

  return jsonb_build_object('ok', true, 'event', to_jsonb(updated_event), 'facts', current_facts);
end;
$$;

revoke all on function public.apply_person_select_access_mode_change(uuid,text,text,jsonb,boolean,text,text) from public, anon, authenticated;
grant execute on function public.apply_person_select_access_mode_change(uuid,text,text,jsonb,boolean,text,text) to service_role;

-- 전환 직전에 시작된 오래된 고객 요청도 새 모드에서 기록을 만들지 못하게 한다.
-- 이벤트 행을 잠그고 현재 모드를 다시 읽으므로 전환 트랜잭션과 직렬화된다.
create or replace function public.enforce_person_select_individual_activity_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event_id uuid;
  target_mode text;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select access_mode into target_mode from public.person_select_events where id = target_event_id for key share;
  if target_mode <> 'individual' then
    raise exception 'person_select_individual_mode_required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_person_select_individual_activity_mode() from public, anon, authenticated;

drop trigger if exists person_select_choices_require_individual_mode on public.person_select_choices;
create trigger person_select_choices_require_individual_mode
before insert or update or delete on public.person_select_choices
for each row execute function public.enforce_person_select_individual_activity_mode();

create or replace function public.enforce_person_select_people_activity_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_mode text;
begin
  if new.first_seen_at is not distinct from old.first_seen_at
     and new.last_seen_at is not distinct from old.last_seen_at
     and new.submitted_at is not distinct from old.submitted_at
     and new.orders is not distinct from old.orders then
    return new;
  end if;
  select access_mode into target_mode from public.person_select_events where id = new.event_id for key share;
  if target_mode <> 'individual' then
    raise exception 'person_select_individual_mode_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_person_select_people_activity_mode() from public, anon, authenticated;

drop trigger if exists person_select_people_activity_require_individual_mode on public.person_select_people;
create trigger person_select_people_activity_require_individual_mode
before update of first_seen_at, last_seen_at, submitted_at, orders on public.person_select_people
for each row execute function public.enforce_person_select_people_activity_mode();

create or replace function public.enforce_person_select_shared_activity_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event_id uuid;
  target_mode text;
begin
  target_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select access_mode into target_mode from public.person_select_events where id = target_event_id for key share;
  if target_mode <> 'project_shared' then
    raise exception 'person_select_shared_mode_required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_person_select_shared_activity_mode() from public, anon, authenticated;

drop trigger if exists person_select_shared_drafts_require_shared_mode on public.person_select_shared_drafts;
create trigger person_select_shared_drafts_require_shared_mode
before insert or update or delete on public.person_select_shared_drafts
for each row execute function public.enforce_person_select_shared_activity_mode();

drop trigger if exists person_select_shared_selections_require_shared_mode on public.person_select_shared_selections;
create trigger person_select_shared_selections_require_shared_mode
before insert or update or delete on public.person_select_shared_selections
for each row execute function public.enforce_person_select_shared_activity_mode();

drop trigger if exists person_select_shared_selection_items_require_shared_mode on public.person_select_shared_selection_items;
create trigger person_select_shared_selection_items_require_shared_mode
before insert or update or delete on public.person_select_shared_selection_items
for each row execute function public.enforce_person_select_shared_activity_mode();

notify pgrst, 'reload schema';
