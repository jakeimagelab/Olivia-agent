-- Phase 2: 워크플로우 중심 통합 스키마 확장
-- Supabase SQL Editor에서 실행하세요.
-- 실행 순서: workflow-agent.sql → phase2-integration.sql

-- ─────────────────────────────────────────────────────────────
-- 1. client_portal_events: 워크플로우 연결 컬럼 추가
--    (테이블은 client-portal-schema.sql에서 이미 생성됨)
-- ─────────────────────────────────────────────────────────────
alter table public.client_portal_events
  add column if not exists workflow_run_id   uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text not null default '';

create index if not exists idx_cpe_workflow_run on public.client_portal_events(workflow_run_id);

-- ─────────────────────────────────────────────────────────────
-- 2. mailing_queue: 워크플로우/태스크/승인 연결 컬럼 추가
--    (테이블은 mailing-queue.sql에서 이미 생성됨)
--    기존 컬럼: type, source_module, hospital_name, to_email,
--              subject, body, attachments, links, status, sent_at
-- ─────────────────────────────────────────────────────────────
alter table public.mailing_queue
  add column if not exists client_id         uuid references public.clients(id) on delete set null,
  add column if not exists scheduled_at      timestamptz,
  add column if not exists workflow_run_id   uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text not null default '',
  add column if not exists agent_task_id     uuid references public.agent_tasks(id) on delete set null,
  add column if not exists approval_id       uuid references public.agent_approvals(id) on delete set null;

create index if not exists idx_mq_client       on public.mailing_queue(client_id);
create index if not exists idx_mq_workflow_run on public.mailing_queue(workflow_run_id);
create index if not exists idx_mq_agent_task   on public.mailing_queue(agent_task_id);

-- ─────────────────────────────────────────────────────────────
-- 3. agent_tasks: 출처 및 포털 연결 컬럼 추가
--    (테이블은 workflow-agent.sql에서 생성됨)
-- ─────────────────────────────────────────────────────────────
alter table public.agent_tasks
  add column if not exists source           text not null default 'system',
  add column if not exists portal_target_id text not null default '';

-- ─────────────────────────────────────────────────────────────
-- 4. agent_logs: 출처 컬럼 추가
-- ─────────────────────────────────────────────────────────────
alter table public.agent_logs
  add column if not exists source text not null default 'system';

-- ─────────────────────────────────────────────────────────────
-- 5. workflow_runs: 인덱스 추가
-- ─────────────────────────────────────────────────────────────
create index if not exists workflow_runs_updated_idx on public.workflow_runs(updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- 6. clients: workflow_status 컬럼 추가 (없으면)
--    (clients-schema.sql에 이미 있으나 안전장치)
-- ─────────────────────────────────────────────────────────────
alter table public.clients
  add column if not exists workflow_status text not null default '상담완료';
