-- Phase 2: 워크플로우 중심 통합 스키마 확장
-- Supabase SQL Editor에서 실행하세요.
-- workflow-agent.sql 실행 후 이 파일을 실행하세요.

-- 1. mailing_queue: 워크플로우/태스크/승인 연결 컬럼 추가
alter table public.mailing_queue
  add column if not exists workflow_run_id  uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text default '',
  add column if not exists agent_task_id    uuid references public.agent_tasks(id) on delete set null,
  add column if not exists approval_id      uuid references public.agent_approvals(id) on delete set null;

create index if not exists mailing_queue_workflow_run_idx on public.mailing_queue(workflow_run_id);
create index if not exists mailing_queue_agent_task_idx  on public.mailing_queue(agent_task_id);

-- 2. agent_tasks: 포털 출처 표시 컬럼 추가
alter table public.agent_tasks
  add column if not exists source           text not null default 'system'
    check (source in ('system','portal','admin','agent')),
  add column if not exists portal_target_id text default '';

-- 3. client_portal_events: 워크플로우 연결 컬럼 추가
alter table public.client_portal_events
  add column if not exists workflow_run_id  uuid references public.workflow_runs(id) on delete set null,
  add column if not exists workflow_step_key text default '';

create index if not exists portal_events_client_idx      on public.client_portal_events(client_id, created_at desc);
create index if not exists portal_events_workflow_run_idx on public.client_portal_events(workflow_run_id);

-- 4. agent_logs: 추가 컨텍스트 컬럼
alter table public.agent_logs
  add column if not exists source text not null default 'system'
    check (source in ('system','portal','admin','agent'));

-- 5. workflow_runs: clients 캐시 동기화를 위한 updated_at 인덱스
create index if not exists workflow_runs_updated_idx on public.workflow_runs(updated_at desc);

-- 6. clients: workflow_status 컬럼이 없으면 추가 (마이그레이션 안전장치)
alter table public.clients
  add column if not exists workflow_status text default '상담완료';
