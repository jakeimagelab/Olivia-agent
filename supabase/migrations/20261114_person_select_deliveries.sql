-- 개인별·공동 사진선택 보정본 전달, 수정 요청, 최종 확인, 다운로드 기록.
-- 운영 DB에는 검토 후 수동 적용한다. 기존 원본 셀렉·주문·제출 데이터는 변경하지 않는다.

create extension if not exists pgcrypto;

alter table public.person_select_events
  add column if not exists customer_stage text not null default 'select',
  add column if not exists delivery_retention_days integer not null default 30,
  add column if not exists delivery_state text not null default 'none',
  add column if not exists delivery_approved_at timestamptz,
  add column if not exists delivery_downloaded_at timestamptz,
  add column if not exists delivery_files_purged_at timestamptz,
  add column if not exists delivery_retention_extended_until timestamptz;

alter table public.person_select_events drop constraint if exists person_select_events_customer_stage_check;
alter table public.person_select_events add constraint person_select_events_customer_stage_check
  check (customer_stage in ('select', 'delivery'));
alter table public.person_select_events drop constraint if exists person_select_events_delivery_retention_days_check;
alter table public.person_select_events add constraint person_select_events_delivery_retention_days_check
  check (delivery_retention_days between 1 and 3650);
alter table public.person_select_events drop constraint if exists person_select_events_delivery_state_check;
alter table public.person_select_events add constraint person_select_events_delivery_state_check
  check (delivery_state in ('none', 'reviewing', 'revision_sent', 'approved'));

alter table public.person_select_people
  add column if not exists delivery_state text not null default 'none',
  add column if not exists delivery_approved_at timestamptz,
  add column if not exists delivery_downloaded_at timestamptz,
  add column if not exists delivery_files_purged_at timestamptz,
  add column if not exists delivery_retention_extended_until timestamptz;

alter table public.person_select_people drop constraint if exists person_select_people_delivery_state_check;
alter table public.person_select_people add constraint person_select_people_delivery_state_check
  check (delivery_state in ('none', 'reviewing', 'revision_sent', 'approved'));

create table if not exists public.person_select_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  person_id uuid references public.person_select_people(id) on delete cascade,
  group_label text,
  display_name text not null,
  normalized_file_name text not null,
  sort_order integer not null default 0,
  current_version integer not null default 1,
  status text not null default 'pending',
  customer_memo text not null default '',
  linked_image_id uuid references public.person_select_images(id) on delete set null,
  link_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_version > 0),
  check (status in ('pending', 'revision_requested', 'revised', 'approved')),
  check (link_method is null or link_method in ('exif', 'filename', 'folder', 'manual'))
);

create table if not exists public.person_select_delivery_versions (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.person_select_deliveries(id) on delete cascade,
  version integer not null,
  storage_path_original text not null,
  storage_path_preview text not null,
  size bigint not null,
  width integer,
  height integer,
  exif_datetime text,
  uploaded_at timestamptz not null default now(),
  customer_memo_snapshot text not null default '',
  unique(delivery_id, version),
  check (version > 0),
  check (size >= 0)
);

create index if not exists person_select_deliveries_event_person_sort_idx
  on public.person_select_deliveries(event_id, person_id, sort_order, id);
create index if not exists person_select_deliveries_event_status_idx
  on public.person_select_deliveries(event_id, status);
create unique index if not exists person_select_deliveries_person_file_idx
  on public.person_select_deliveries(event_id, person_id, normalized_file_name)
  where person_id is not null;
create unique index if not exists person_select_deliveries_shared_file_idx
  on public.person_select_deliveries(event_id, coalesce(group_label, ''), normalized_file_name)
  where person_id is null;
create index if not exists person_select_delivery_versions_delivery_version_idx
  on public.person_select_delivery_versions(delivery_id, version desc);
create index if not exists person_select_people_event_delivery_state_idx
  on public.person_select_people(event_id, delivery_state);

alter table public.person_select_deliveries enable row level security;
alter table public.person_select_delivery_versions enable row level security;

revoke all on table public.person_select_deliveries from anon, authenticated;
revoke all on table public.person_select_delivery_versions from anon, authenticated;
grant all on table public.person_select_deliveries to service_role;
grant all on table public.person_select_delivery_versions to service_role;

drop policy if exists "service role full access person_select_deliveries" on public.person_select_deliveries;
create policy "service role full access person_select_deliveries"
  on public.person_select_deliveries for all to service_role using (true) with check (true);
drop policy if exists "service role full access person_select_delivery_versions" on public.person_select_delivery_versions;
create policy "service role full access person_select_delivery_versions"
  on public.person_select_delivery_versions for all to service_role using (true) with check (true);

comment on table public.person_select_deliveries is
  'Logical delivered retouch photo. Current version and customer review state are preserved independently from original selections.';
comment on table public.person_select_delivery_versions is
  'Immutable delivery file versions. Originals remain private and are signed only after final approval.';

notify pgrst, 'reload schema';
