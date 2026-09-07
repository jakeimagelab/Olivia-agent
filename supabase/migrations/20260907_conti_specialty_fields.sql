-- 진료과별 코드 taxonomy와 신규 입력을 저장한다.
alter table public.conti_runs
  add column if not exists custom_items jsonb not null default '[]'::jsonb,
  add column if not exists other_staff_role text default '',
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;

create index if not exists conti_runs_workflow_run_idx on public.conti_runs(workflow_run_id, updated_at desc);

alter table public.conti_scenes
  add column if not exists preparation_text text default '';

notify pgrst, 'reload schema';
