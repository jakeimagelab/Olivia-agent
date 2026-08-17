-- Olivia Chat Intelligence Core(2026-08-17) — "히어 촬영 준비하자" 같은 요청으로 시작되는
-- Task Session. 여기엔 "지금 어떤 세션이 진행 중인지/일시정지인지"만 저장한다 — 할 일 목록
-- 자체(tasks[])는 저장하지 않는다. workflow_runs/conti_saves/quotes/contracts/calendar_tasks를
-- 매번 다시 읽어 계산한다(lib/olivia/taskSession/nextAction.ts) — 별도 테이블에 중복 저장하면
-- 실제 업무 상태와 어긋날 위험이 있어서다(work_journal_tasks처럼 독립된 체크리스트를 새로
-- 만들지 않는다는 원칙).
-- 기존 설치 환경에도 반복 실행할 수 있는 additive migration입니다.

create table if not exists public.olivia_task_sessions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.clients(id) on delete cascade,
  project_id       uuid references public.workflow_runs(id) on delete set null,
  title            text not null,
  session_type     text not null default 'general'
                     check (session_type in ('shoot-prep', 'quote-prep', 'contract-prep', 'delivery', 'general')),
  status           text not null default 'active' check (status in ('active', 'paused', 'completed')),
  current_task_key text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_olivia_task_sessions_client
  on public.olivia_task_sessions(client_id, status);
create index if not exists idx_olivia_task_sessions_status
  on public.olivia_task_sessions(status, updated_at desc);

alter table public.olivia_task_sessions enable row level security;
drop policy if exists "service role full access olivia task sessions" on public.olivia_task_sessions;
create policy "service role full access olivia task sessions"
  on public.olivia_task_sessions for all to service_role
  using (true) with check (true);

grant all on table public.olivia_task_sessions to service_role;
notify pgrst, 'reload schema';
