-- Olivia 미팅 비서 채팅 연동
-- 기존 캘린더와 브리핑 스키마를 유지하는 additive migration입니다.

alter table public.calendar_tasks
  add column if not exists meeting_context jsonb not null default '{}'::jsonb;

alter table public.olivia_briefings
  add column if not exists calendar_task_id uuid,
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists deduplication_key text;

create unique index if not exists idx_olivia_briefings_deduplication
  on public.olivia_briefings(deduplication_key)
  where deduplication_key is not null;

create index if not exists idx_calendar_tasks_meeting_date
  on public.calendar_tasks(date, category)
  where category = 'client';
