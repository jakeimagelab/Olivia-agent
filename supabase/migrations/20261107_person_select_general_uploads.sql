-- 사진선택 프로젝트 범용 설정, 프로젝트 공유 셀렉, 로컬 업로드 체크포인트.
-- 기존 행은 개인별 + 기존 화면으로 유지한다.

create extension if not exists pgcrypto;

-- source_layout은 접근 방식과 별개인 실제 폴더 구조다. 기존 두 값을 보존하고
-- 공용 프로젝트의 일반 폴더 구조만 추가한다.
alter table public.person_select_events drop constraint if exists person_select_events_source_layout_check;
alter table public.person_select_events add constraint person_select_events_source_layout_check
  check (source_layout in ('school','person-folders','project'));

alter table public.person_select_events add column if not exists project_type text not null default 'general';
alter table public.person_select_events add column if not exists access_mode text not null default 'individual';
alter table public.person_select_events add column if not exists customer_view_mode text not null default 'classic';
alter table public.person_select_events add column if not exists shared_token text;
alter table public.person_select_events add column if not exists shared_token_version integer not null default 1;
alter table public.person_select_events add column if not exists shared_link_active boolean not null default true;
alter table public.person_select_events add column if not exists shared_token_expires_at timestamptz;

-- 이미 학교 항목을 가진 기존 행만 학교 유형으로 표시한다. 벨라비타 등 기존 이름 폴더
-- 프로젝트는 일반 유형으로 남고, 저장된 항목/상품/가격은 전혀 변경하지 않는다.
update public.person_select_events event
set project_type = 'school'
where project_type = 'general'
  and exists (
    select 1 from jsonb_array_elements(coalesce(event.categories, '[]'::jsonb)) category
    where category->>'key' in ('profile', 'homeroom')
  )
  and exists (
    select 1 from jsonb_array_elements(coalesce(event.categories, '[]'::jsonb)) category
    where category->>'key' = 'homeroom'
  );

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'person_select_events_project_type_check') then
    alter table public.person_select_events add constraint person_select_events_project_type_check
      check (project_type in ('general','school','medical','business'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'person_select_events_access_mode_check') then
    alter table public.person_select_events add constraint person_select_events_access_mode_check
      check (access_mode in ('individual','project_shared'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'person_select_events_customer_view_mode_check') then
    alter table public.person_select_events add constraint person_select_events_customer_view_mode_check
      check (customer_view_mode in ('classic','bridge'));
  end if;
end $$;

create unique index if not exists person_select_events_shared_token_idx
  on public.person_select_events(shared_token) where shared_token is not null;

create table if not exists public.person_select_shared_drafts (
  event_id uuid primary key references public.person_select_events(id) on delete cascade,
  revision bigint not null default 0,
  items jsonb not null default '[]'::jsonb,
  customer_memo text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.person_select_shared_selections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  request_key text not null,
  revision bigint not null default 0,
  customer_memo text not null default '',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(event_id, request_key)
);
create index if not exists person_select_shared_selections_latest_idx
  on public.person_select_shared_selections(event_id, submitted_at desc);

create table if not exists public.person_select_shared_selection_items (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.person_select_shared_selections(id) on delete cascade,
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  image_id uuid not null references public.person_select_images(id) on delete restrict,
  customer_rating smallint,
  memo text not null default '',
  created_at timestamptz not null default now(),
  unique(selection_id, image_id),
  check (customer_rating is null or customer_rating between 1 and 5)
);
create index if not exists person_select_shared_selection_items_event_image_idx
  on public.person_select_shared_selection_items(event_id, image_id);

create table if not exists public.person_select_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  project_title text not null default '',
  source_name text not null default '',
  layout text not null,
  status text not null default 'queued',
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  pending_count integer not null default 0,
  active_count integer not null default 0,
  needs_file_reselection boolean not null default false,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (layout in ('school','person-folders','project')),
  check (status in ('queued','uploading','paused','completed','partial_failed','failed','canceled')),
  check (total_count >= 0 and success_count >= 0 and failed_count >= 0 and pending_count >= 0 and active_count >= 0)
);
create index if not exists person_select_upload_jobs_event_created_idx
  on public.person_select_upload_jobs(event_id, created_at desc);
create index if not exists person_select_upload_jobs_active_idx
  on public.person_select_upload_jobs(status, updated_at desc)
  where status in ('queued','uploading','paused','partial_failed');
create unique index if not exists person_select_upload_jobs_one_active_per_event_idx
  on public.person_select_upload_jobs(event_id)
  where status in ('queued','uploading','paused');

create table if not exists public.person_select_upload_job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.person_select_upload_jobs(id) on delete cascade,
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  relative_path text not null,
  file_name text not null,
  file_size bigint,
  last_modified bigint,
  idempotency_key text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  image_id uuid references public.person_select_images(id) on delete set null,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, relative_path),
  check (status in ('pending','uploading','completed','failed','canceled')),
  check (attempts >= 0)
);
create index if not exists person_select_upload_job_files_job_status_idx
  on public.person_select_upload_job_files(job_id, status, id);
create index if not exists person_select_upload_job_files_event_key_idx
  on public.person_select_upload_job_files(event_id, idempotency_key);

alter table public.person_select_shared_drafts enable row level security;
alter table public.person_select_shared_selections enable row level security;
alter table public.person_select_shared_selection_items enable row level security;
alter table public.person_select_upload_jobs enable row level security;
alter table public.person_select_upload_job_files enable row level security;

do $$ declare t text; begin
  foreach t in array array[
    'person_select_shared_drafts',
    'person_select_shared_selections',
    'person_select_shared_selection_items',
    'person_select_upload_jobs',
    'person_select_upload_job_files'
  ] loop
    execute format('drop policy if exists "service role full access %s" on public.%I', t, t);
    execute format('create policy "service role full access %s" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;

-- 전체 draft를 저장하되 revision이 정확히 일치할 때만 갱신한다. 동시에 연 화면이
-- 다른 담당자의 선택을 조용히 덮는 일을 막는다.
create or replace function public.save_person_select_shared_draft(
  p_event_id uuid,
  p_expected_revision bigint,
  p_items jsonb,
  p_customer_memo text
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_row public.person_select_shared_drafts%rowtype;
begin
  select * into current_row from public.person_select_shared_drafts
  where event_id = p_event_id for update;

  if not found then
    if p_expected_revision <> 0 then raise exception 'draft_revision_conflict' using errcode = '40001'; end if;
    insert into public.person_select_shared_drafts(event_id, revision, items, customer_memo)
    values (p_event_id, 1, p_items, p_customer_memo)
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
  set revision = current_row.revision + 1, items = p_items, customer_memo = p_customer_memo, updated_at = now()
  where event_id = p_event_id
  returning person_select_shared_drafts.revision, person_select_shared_drafts.items,
    person_select_shared_drafts.customer_memo, person_select_shared_drafts.updated_at
  into revision, items, customer_memo, updated_at;
  return next;
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
declare existing_id uuid;
declare next_id uuid;
begin
  perform 1 from public.person_select_events where id = p_event_id for update;
  select id into existing_id from public.person_select_shared_selections
    where event_id = p_event_id and request_key = p_request_key;
  if existing_id is not null then
    selection_id := existing_id; created := false; return next; return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) item
    left join public.person_select_images image
      on image.id = (item->>'image_id')::uuid and image.event_id = p_event_id
    where image.id is null
  ) then
    raise exception 'shared_image_not_owned' using errcode = '22023';
  end if;

  insert into public.person_select_shared_selections(event_id, request_key, revision, customer_memo)
  values (p_event_id, p_request_key, coalesce((select revision from public.person_select_shared_drafts where event_id = p_event_id), 0), p_customer_memo)
  returning id into next_id;

  insert into public.person_select_shared_selection_items(selection_id, event_id, image_id, customer_rating, memo)
  select next_id, p_event_id, (item->>'image_id')::uuid,
    nullif(item->>'rating', '')::smallint, coalesce(item->>'memo', '')
  from jsonb_array_elements(p_items) item;

  selection_id := next_id; created := true; return next;
end $$;

revoke all on function public.submit_person_select_shared(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.submit_person_select_shared(uuid,text,jsonb,text) to service_role;

notify pgrst, 'reload schema';
