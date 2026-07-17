-- Olivia 12단계 워크플로우 후속 확장
-- 1) 추가 촬영을 원 프로젝트에 연결된 하위 실행으로 관리
-- 2) 원본 1년 / 보정본 3년 보관 기한을 실행 건 단위로 관리

alter table public.workflow_runs
  add column if not exists parent_workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists run_kind text not null default 'primary',
  add column if not exists original_delivered_at timestamptz,
  add column if not exists original_expires_at timestamptz,
  add column if not exists retouched_delivered_at timestamptz,
  add column if not exists retouched_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workflow_runs_run_kind_check'
  ) then
    alter table public.workflow_runs
      add constraint workflow_runs_run_kind_check
      check (run_kind in ('primary', 'additional_shooting'));
  end if;
end $$;

create index if not exists workflow_runs_parent_idx
  on public.workflow_runs(parent_workflow_run_id, created_at desc);

create index if not exists workflow_runs_retention_idx
  on public.workflow_runs(original_expires_at, retouched_expires_at)
  where original_expires_at is not null or retouched_expires_at is not null;

-- 기존 완료 이력도 가능한 범위에서 보관 기한을 복원한다.
with latest_original as (
  select distinct on (workflow_run_id) workflow_run_id, completed_at
  from public.workflow_step_runs
  where step_key in ('original_delivery', 'client_selection')
    and completed_at is not null
  order by workflow_run_id, completed_at desc
)
update public.workflow_runs wr
set original_delivered_at = source.completed_at,
    original_expires_at = source.completed_at + interval '1 year'
from latest_original source
where source.workflow_run_id = wr.id
  and wr.original_expires_at is null;

with latest_retouched as (
  select distinct on (workflow_run_id) workflow_run_id, completed_at
  from public.workflow_step_runs
  where step_key = 'final_delivery'
    and completed_at is not null
  order by workflow_run_id, completed_at desc
)
update public.workflow_runs wr
set retouched_delivered_at = source.completed_at,
    retouched_expires_at = source.completed_at + interval '3 years'
from latest_retouched source
where source.workflow_run_id = wr.id
  and wr.retouched_expires_at is null;
