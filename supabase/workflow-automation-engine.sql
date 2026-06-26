-- Olivia Agent 3단계: 워크플로우 자동화 엔진 보완
-- 기존 workflow-agent.sql / workflow-14step-migration.sql 실행 후 추가 실행하세요.

alter table public.workflow_runs
  add column if not exists contact_name text,
  add column if not exists contact_email text;

alter table public.agent_tasks
  add column if not exists workflow_step_key text,
  add column if not exists workflow_step_name text,
  add column if not exists client_name text,
  add column if not exists project_name text,
  add column if not exists retry_count integer not null default 0;

alter table public.agent_approvals
  add column if not exists workflow_step_key text,
  add column if not exists client_name text,
  add column if not exists project_name text;

alter table public.mailing_queue
  add column if not exists workflow_run_id text,
  add column if not exists workflow_step_key text,
  add column if not exists agent_task_id text,
  add column if not exists approval_id text,
  add column if not exists related_type text,
  add column if not exists related_id text,
  add column if not exists mailing_type text,
  add column if not exists approval_status text not null default 'none'
    check (approval_status in ('none','pending','approved','rejected'));

alter table public.mailing_queue
  drop constraint if exists mailing_queue_type_check;

alter table public.mailing_queue
  add constraint mailing_queue_type_check
  check (type in (
    'quote','contract','conti','proposal','original_files',
    'gallery','review_form','monthly_report',
    'per_report','per_order','per_donation'
  ));

create unique index if not exists idx_agent_tasks_workflow_step_type
  on public.agent_tasks(workflow_run_id, workflow_step_key, task_type)
  where workflow_run_id is not null and workflow_step_key is not null;

create unique index if not exists idx_agent_approvals_task_active
  on public.agent_approvals(agent_task_id)
  where agent_task_id is not null and status <> 'rejected';

create unique index if not exists idx_mailing_queue_workflow_task
  on public.mailing_queue(source_module, source_id)
  where source_module = 'workflow_agent' and source_id is not null;

create index if not exists idx_agent_tasks_step_status
  on public.agent_tasks(workflow_run_id, workflow_step_key, status);

create index if not exists idx_agent_approvals_step_status
  on public.agent_approvals(workflow_run_id, workflow_step_key, status);

create index if not exists idx_mailing_queue_workflow_status
  on public.mailing_queue(workflow_run_id, workflow_step_key, status, approval_status);
