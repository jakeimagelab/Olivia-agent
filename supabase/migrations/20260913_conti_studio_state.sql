-- Conti Studio V3의 뷰 설정과 Scene에서 파생되지 않는 최소 현장 상태입니다.
-- 실제 콘티 내용/순서/완료는 계속 conti_runs/groups/scenes가 소유합니다.
alter table public.conti_runs
  add column if not exists studio_state jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
