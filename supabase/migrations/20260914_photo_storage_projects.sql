-- Olivia Photo Storage PHASE 3
-- 프로젝트 lifecycle/승인 상태만 저장한다. 실제 파일과 remote_jobs는 이 migration에서 다루지 않는다.

create table if not exists public.photo_storage_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  source_relative_path text not null unique,
  status text not null default 'READY'
    check (status in ('READY', 'APPROVED', 'DEFERRED', 'REVIEW_REQUIRED', 'ERROR')),
  raw_count integer not null default 0 check (raw_count >= 0),
  jpg_count integer not null default 0 check (jpg_count >= 0),
  jpg_bytes bigint not null default 0 check (jpg_bytes >= 0),
  fingerprint text,
  discovered_at timestamptz not null default now(),
  prepared_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists photo_storage_projects_status_idx
  on public.photo_storage_projects (status, discovered_at desc);

create table if not exists public.photo_storage_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.photo_storage_projects(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'PHOTO_PROJECT_READY',
      'PHOTO_PROJECT_APPROVED',
      'PHOTO_PROJECT_DEFERRED',
      'PHOTO_PROJECT_REVIEW_REQUIRED',
      'PHOTO_PROJECT_ERROR'
    )),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'ACKNOWLEDGED')),
  message text not null,
  requires_action boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists photo_storage_events_project_idx
  on public.photo_storage_events (project_id, created_at desc);

-- 동일 프로젝트/이벤트의 열린 알림은 하나만 허용한다.
create unique index if not exists photo_storage_events_open_unique_idx
  on public.photo_storage_events (project_id, event_type)
  where status = 'OPEN';

alter table public.photo_storage_projects enable row level security;
alter table public.photo_storage_events enable row level security;

-- 브라우저는 service role을 직접 사용하지 않는다. 서버 API가 관리자 세션을 확인한 뒤
-- service role로 읽고 쓰므로 anon/authenticated에는 직접 권한을 부여하지 않는다.
revoke all on table public.photo_storage_projects from anon, authenticated;
revoke all on table public.photo_storage_events from anon, authenticated;
