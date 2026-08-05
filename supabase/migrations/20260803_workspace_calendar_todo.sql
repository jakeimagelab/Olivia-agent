-- 워크스페이스 할일 — 캘린더 연동 + 체크리스트 항목별 담당자
-- docs/superpowers/specs/2026-08-03-workspace-calendar-todo-design.md

-- 캘린더 항목 1개당 워크스페이스 할일 1개만 생기도록 연결 컬럼을 둔다.
-- 캘린더 항목이 휴지통으로 이동(원본 삭제)되면 연동된 할일은 남고 이 값만 비워진다.
alter table public.team_tasks
  add column if not exists calendar_task_id uuid references public.calendar_tasks(id) on delete set null;

create unique index if not exists team_tasks_calendar_task_id_key
  on public.team_tasks(calendar_task_id)
  where calendar_task_id is not null;

-- 체크리스트 항목(세부 업무) 각각에 담당 직원을 지정한다.
alter table public.team_task_checklists
  add column if not exists assignee_id uuid references public.chat_members(id) on delete set null;

create index if not exists team_task_checklists_assignee_idx
  on public.team_task_checklists(assignee_id)
  where assignee_id is not null;

notify pgrst, 'reload schema';
