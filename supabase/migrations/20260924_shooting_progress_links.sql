-- 촬영 폴더를 기존 일정/워크플로/셀렉 갤러리에 연결한다.
-- 상태는 각 기존 테이블에서 파생하며 별도 상태 머신은 만들지 않는다.

alter table public.photo_storage_projects
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists calendar_task_id uuid references public.calendar_tasks(id) on delete set null;

alter table public.select_galleries
  add column if not exists photo_storage_project_id uuid references public.photo_storage_projects(id) on delete set null;

create index if not exists photo_storage_projects_workflow_run_idx
  on public.photo_storage_projects (workflow_run_id)
  where workflow_run_id is not null;

create index if not exists photo_storage_projects_calendar_task_idx
  on public.photo_storage_projects (calendar_task_id)
  where calendar_task_id is not null;

create index if not exists select_galleries_photo_storage_project_idx
  on public.select_galleries (photo_storage_project_id, updated_at desc)
  where photo_storage_project_id is not null;

notify pgrst, 'reload schema';
