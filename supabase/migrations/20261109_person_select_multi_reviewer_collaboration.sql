-- 프로젝트 공유 사진선택: 검토자별 독립 셀렉, 컬러 레이블, 프로젝트 대화, NAS 공유 링크.
-- 기존 event 단위 공동 셀렉은 이벤트마다 생성하는 호환 검토자에 그대로 연결한다.

create extension if not exists pgcrypto;

alter table public.person_select_events
  add column if not exists nas_download_url text;

create table if not exists public.person_select_shared_reviewers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  display_name text not null,
  role_label text not null default '',
  access_token_hash text not null unique,
  token_version integer not null default 1,
  active boolean not null default true,
  is_legacy boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(display_name) between 1 and 80),
  check (char_length(role_label) <= 80),
  check (char_length(access_token_hash) = 64),
  check (token_version >= 1)
);

create index if not exists person_select_shared_reviewers_event_idx
  on public.person_select_shared_reviewers(event_id, created_at);
create unique index if not exists person_select_shared_reviewers_legacy_idx
  on public.person_select_shared_reviewers(event_id) where is_legacy;

create or replace function public.ensure_person_select_legacy_reviewer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.access_mode = 'project_shared' then
    insert into public.person_select_shared_reviewers(
      event_id, display_name, role_label, access_token_hash, active, is_legacy
    ) values (
      new.id,
      '기존 공동 셀렉',
      '호환',
      encode(digest('person-select-legacy:' || new.id::text, 'sha256'), 'hex'),
      true,
      true
    ) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists person_select_events_ensure_legacy_reviewer on public.person_select_events;
create trigger person_select_events_ensure_legacy_reviewer
after insert or update of access_mode on public.person_select_events
for each row execute function public.ensure_person_select_legacy_reviewer();

-- 과거 event 공유 링크가 계속 같은 데이터에 접근하도록 이벤트마다 호환 검토자를 만든다.
insert into public.person_select_shared_reviewers(
  event_id, display_name, role_label, access_token_hash, active, is_legacy
)
select
  event.id,
  '기존 공동 셀렉',
  '호환',
  encode(digest('person-select-legacy:' || event.id::text, 'sha256'), 'hex'),
  true,
  true
from public.person_select_events event
where event.access_mode = 'project_shared'
on conflict do nothing;

alter table public.person_select_shared_drafts
  add column if not exists reviewer_id uuid references public.person_select_shared_reviewers(id) on delete cascade;

update public.person_select_shared_drafts draft
set reviewer_id = reviewer.id
from public.person_select_shared_reviewers reviewer
where reviewer.event_id = draft.event_id
  and reviewer.is_legacy
  and draft.reviewer_id is null;

alter table public.person_select_shared_drafts
  alter column reviewer_id set not null;
alter table public.person_select_shared_drafts
  drop constraint if exists person_select_shared_drafts_pkey;
alter table public.person_select_shared_drafts
  add constraint person_select_shared_drafts_pkey primary key(event_id, reviewer_id);
create index if not exists person_select_shared_drafts_reviewer_idx
  on public.person_select_shared_drafts(reviewer_id);

alter table public.person_select_shared_selections
  add column if not exists reviewer_id uuid references public.person_select_shared_reviewers(id) on delete cascade;

update public.person_select_shared_selections selection
set reviewer_id = reviewer.id
from public.person_select_shared_reviewers reviewer
where reviewer.event_id = selection.event_id
  and reviewer.is_legacy
  and selection.reviewer_id is null;

alter table public.person_select_shared_selections
  alter column reviewer_id set not null;
alter table public.person_select_shared_selections
  drop constraint if exists person_select_shared_selections_event_id_request_key_key;
create unique index if not exists person_select_shared_selections_reviewer_request_idx
  on public.person_select_shared_selections(event_id, reviewer_id, request_key);
create index if not exists person_select_shared_selections_reviewer_latest_idx
  on public.person_select_shared_selections(event_id, reviewer_id, submitted_at desc);
create index if not exists person_select_shared_selections_reviewer_idx
  on public.person_select_shared_selections(reviewer_id);

alter table public.person_select_shared_selection_items
  add column if not exists reviewer_id uuid references public.person_select_shared_reviewers(id) on delete cascade;
alter table public.person_select_shared_selection_items
  add column if not exists customer_color_label smallint;

update public.person_select_shared_selection_items item
set reviewer_id = selection.reviewer_id
from public.person_select_shared_selections selection
where selection.id = item.selection_id
  and item.reviewer_id is null;

alter table public.person_select_shared_selection_items
  alter column reviewer_id set not null;
create index if not exists person_select_shared_selection_items_reviewer_idx
  on public.person_select_shared_selection_items(reviewer_id, selection_id);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'person_select_shared_selection_items_color_check'
  ) then
    alter table public.person_select_shared_selection_items
      add constraint person_select_shared_selection_items_color_check
      check (customer_color_label is null or customer_color_label between 6 and 9);
  end if;
end $$;

create table if not exists public.person_select_project_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  reviewer_id uuid references public.person_select_shared_reviewers(id) on delete set null,
  admin_actor text,
  body text not null,
  client_request_id text not null,
  created_at timestamptz not null default now(),
  unique(event_id, client_request_id),
  check ((reviewer_id is not null) <> (admin_actor is not null)),
  check (char_length(body) between 1 and 2000),
  check (admin_actor is null or char_length(admin_actor) between 1 and 80),
  check (char_length(client_request_id) between 8 and 200)
);

create index if not exists person_select_project_messages_event_created_idx
  on public.person_select_project_messages(event_id, created_at, id);
create index if not exists person_select_project_messages_reviewer_idx
  on public.person_select_project_messages(reviewer_id) where reviewer_id is not null;

alter table public.person_select_shared_reviewers enable row level security;
alter table public.person_select_project_messages enable row level security;

drop policy if exists "service role full access person_select_shared_reviewers" on public.person_select_shared_reviewers;
create policy "service role full access person_select_shared_reviewers"
  on public.person_select_shared_reviewers for all to service_role using (true) with check (true);

drop policy if exists "service role full access person_select_project_messages" on public.person_select_project_messages;
create policy "service role full access person_select_project_messages"
  on public.person_select_project_messages for all to service_role using (true) with check (true);

create or replace function public.save_person_select_shared_draft_v2(
  p_event_id uuid,
  p_reviewer_id uuid,
  p_expected_revision bigint,
  p_items jsonb,
  p_customer_memo text
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_row public.person_select_shared_drafts%rowtype;
begin
  if not exists (
    select 1 from public.person_select_shared_reviewers
    where id = p_reviewer_id and event_id = p_event_id and active
  ) then
    raise exception 'shared_reviewer_not_available' using errcode = '42501';
  end if;

  select * into current_row from public.person_select_shared_drafts
  where event_id = p_event_id and reviewer_id = p_reviewer_id for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception 'draft_revision_conflict' using errcode = '40001';
    end if;
    insert into public.person_select_shared_drafts(event_id, reviewer_id, revision, items, customer_memo)
    values (p_event_id, p_reviewer_id, 1, p_items, p_customer_memo)
    returning person_select_shared_drafts.revision, person_select_shared_drafts.items,
      person_select_shared_drafts.customer_memo, person_select_shared_drafts.updated_at
    into revision, items, customer_memo, updated_at;
    return next;
    return;
  end if;

  if current_row.revision <> p_expected_revision then
    raise exception 'draft_revision_conflict' using errcode = '40001';
  end if;

  update public.person_select_shared_drafts
  set revision = current_row.revision + 1,
      items = p_items,
      customer_memo = p_customer_memo,
      updated_at = now()
  where event_id = p_event_id and reviewer_id = p_reviewer_id
  returning person_select_shared_drafts.revision, person_select_shared_drafts.items,
    person_select_shared_drafts.customer_memo, person_select_shared_drafts.updated_at
  into revision, items, customer_memo, updated_at;
  return next;
end $$;

revoke all on function public.save_person_select_shared_draft_v2(uuid,uuid,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_person_select_shared_draft_v2(uuid,uuid,bigint,jsonb,text) to service_role;

create or replace function public.submit_person_select_shared_v2(
  p_event_id uuid,
  p_reviewer_id uuid,
  p_request_key text,
  p_items jsonb,
  p_customer_memo text
) returns table(selection_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare existing_id uuid;
declare next_id uuid;
begin
  perform 1 from public.person_select_events where id = p_event_id for update;
  if not exists (
    select 1 from public.person_select_shared_reviewers
    where id = p_reviewer_id and event_id = p_event_id and active
  ) then
    raise exception 'shared_reviewer_not_available' using errcode = '42501';
  end if;

  select id into existing_id from public.person_select_shared_selections
  where event_id = p_event_id
    and reviewer_id = p_reviewer_id
    and request_key = p_request_key;
  if existing_id is not null then
    selection_id := existing_id;
    created := false;
    return next;
    return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    left join public.person_select_images image
      on image.id = (item->>'image_id')::uuid and image.event_id = p_event_id
    where image.id is null
  ) then
    raise exception 'shared_image_not_owned' using errcode = '22023';
  end if;

  insert into public.person_select_shared_selections(
    event_id, reviewer_id, request_key, revision, customer_memo
  ) values (
    p_event_id,
    p_reviewer_id,
    p_request_key,
    coalesce((
      select revision from public.person_select_shared_drafts
      where event_id = p_event_id and reviewer_id = p_reviewer_id
    ), 0),
    p_customer_memo
  ) returning id into next_id;

  insert into public.person_select_shared_selection_items(
    selection_id, event_id, reviewer_id, image_id, customer_rating, customer_color_label, memo
  )
  select
    next_id,
    p_event_id,
    p_reviewer_id,
    (item->>'image_id')::uuid,
    nullif(item->>'rating', '')::smallint,
    nullif(item->>'color_label', '')::smallint,
    coalesce(item->>'memo', '')
  from jsonb_array_elements(p_items) item;

  selection_id := next_id;
  created := true;
  return next;
end $$;

revoke all on function public.submit_person_select_shared_v2(uuid,uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_person_select_shared_v2(uuid,uuid,text,jsonb,text) to service_role;

-- 이전 함수 호출자는 호환 검토자의 결과를 계속 읽고 쓴다.
create or replace function public.save_person_select_shared_draft(
  p_event_id uuid,
  p_expected_revision bigint,
  p_items jsonb,
  p_customer_memo text
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare legacy_reviewer_id uuid;
begin
  select id into legacy_reviewer_id
  from public.person_select_shared_reviewers
  where event_id = p_event_id and is_legacy;
  return query select * from public.save_person_select_shared_draft_v2(
    p_event_id, legacy_reviewer_id, p_expected_revision, p_items, p_customer_memo
  );
end $$;

revoke all on function public.save_person_select_shared_draft(uuid,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_person_select_shared_draft(uuid,bigint,jsonb,text) to service_role;

create or replace function public.submit_person_select_shared(
  p_event_id uuid,
  p_request_key text,
  p_items jsonb,
  p_customer_memo text
) returns table(selection_id uuid, created boolean)
language plpgsql security definer set search_path = public as $$
declare legacy_reviewer_id uuid;
begin
  select id into legacy_reviewer_id
  from public.person_select_shared_reviewers
  where event_id = p_event_id and is_legacy;
  return query select * from public.submit_person_select_shared_v2(
    p_event_id, legacy_reviewer_id, p_request_key, p_items, p_customer_memo
  );
end $$;

revoke all on function public.submit_person_select_shared(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_person_select_shared(uuid,text,jsonb,text) to service_role;

do $$ begin
  begin
    alter publication supabase_realtime add table public.person_select_project_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
