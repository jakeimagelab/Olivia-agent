-- Phase 2: 워크플로우 중심 통합 스키마 확장
-- Supabase SQL Editor에서 실행하세요.
-- workflow-agent.sql 실행 후 이 파일을 실행하세요.

-- ─────────────────────────────────────────────────────────────
-- 1. client_portal_events 테이블 생성 (없으면)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.client_portal_events (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid,
  event_type       text not null,
  target_type      text not null default '',
  target_id        text not null default '',
  memo             text not null default '',
  workflow_run_id  uuid references public.workflow_runs(id) on delete set null,
  workflow_step_key text not null default '',
  created_at       timestamptz not null default now()
);

create index if not exists portal_events_client_idx       on public.client_portal_events(client_id, created_at desc);
create index if not exists portal_events_workflow_run_idx  on public.client_portal_events(workflow_run_id);

-- 이미 존재하는 경우를 위한 컬럼 추가 (중복 실행 안전)
alter table public.client_portal_events
  add column if not exists workflow_run_id  uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text not null default '';

-- ─────────────────────────────────────────────────────────────
-- 2. mailing_queue 테이블 생성 (없으면)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.mailing_queue (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid,
  project_id       uuid,
  subject          text not null default '',
  body             text not null default '',
  send_to          text not null default '',
  send_to_name     text not null default '',
  status           text not null default 'draft'
    check (status in ('draft','pending','sent','failed','canceled')),
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  mailing_type     text not null default 'general',
  workflow_run_id  uuid references public.workflow_runs(id) on delete set null,
  workflow_step_key text not null default '',
  agent_task_id    uuid references public.agent_tasks(id) on delete set null,
  approval_id      uuid references public.agent_approvals(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 기존 mailing_queue에 워크플로우 연결 컬럼 추가
-- (기존 컬럼: type, source_module, hospital_name, to_email, subject, body, status, sent_at 등)
alter table public.mailing_queue
  add column if not exists scheduled_at      timestamptz,
  add column if not exists mailing_type      text not null default 'general',
  add column if not exists workflow_run_id   uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text not null default '',
  add column if not exists agent_task_id     uuid references public.agent_tasks(id) on delete set null,
  add column if not exists approval_id       uuid references public.agent_approvals(id) on delete set null;

create index if not exists mailing_queue_created_idx      on public.mailing_queue(created_at desc);
create index if not exists mailing_queue_client_idx       on public.mailing_queue(client_id);
create index if not exists mailing_queue_workflow_run_idx  on public.mailing_queue(workflow_run_id);
create index if not exists mailing_queue_agent_task_idx   on public.mailing_queue(agent_task_id);

-- ─────────────────────────────────────────────────────────────
-- 3. client_revision_requests 테이블 생성 (없으면)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.client_revision_requests (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid,
  request_type     text not null default 'general',
  title            text not null,
  content          text not null default '',
  related_file     text not null default '',
  priority         text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status           text not null default 'pending'
    check (status in ('pending','in_progress','resolved','rejected')),
  admin_memo       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists revision_requests_client_idx on public.client_revision_requests(client_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 4. client_reviews 테이블 생성 (없으면)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.client_reviews (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid unique,
  overall_rating      integer not null check (overall_rating between 1 and 5),
  shooting_rating     integer not null default 5 check (shooting_rating between 1 and 5),
  result_rating       integer not null default 5 check (result_rating between 1 and 5),
  good_points         text not null default '',
  improvement_points  text not null default '',
  public_review_text  text not null default '',
  allow_public_use    boolean not null default false,
  allow_hospital_name boolean not null default true,
  writer_name         text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists client_reviews_client_idx on public.client_reviews(client_id);

-- ─────────────────────────────────────────────────────────────
-- 5. client_portal_access 테이블 생성 (없으면)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.client_portal_access (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null,
  email            text not null default '',
  access_token     text not null unique,
  is_active        boolean not null default true,
  token_expires_at timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists portal_access_client_idx on public.client_portal_access(client_id);
create index if not exists portal_access_token_idx  on public.client_portal_access(access_token);

-- ─────────────────────────────────────────────────────────────
-- 6. agent_tasks: 포털 출처 표시 컬럼 추가
-- ─────────────────────────────────────────────────────────────
alter table public.agent_tasks
  add column if not exists source           text not null default 'system',
  add column if not exists portal_target_id text not null default '';

-- ─────────────────────────────────────────────────────────────
-- 7. agent_logs: source 컬럼 추가
-- ─────────────────────────────────────────────────────────────
alter table public.agent_logs
  add column if not exists source text not null default 'system';

-- ─────────────────────────────────────────────────────────────
-- 8. workflow_runs: 인덱스 추가
-- ─────────────────────────────────────────────────────────────
create index if not exists workflow_runs_updated_idx on public.workflow_runs(updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- 9. clients: workflow_status 컬럼 추가 (없으면)
-- ─────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists workflow_status text not null default '상담완료';
