-- 메모를 독립 메뉴에서 컨텍스트(고객/프로젝트/일정/업무) 부속 기능으로 전환
-- 기존 hospital_id 컬럼은 그대로 두고(고객 연결은 계속 그 값으로도 조회 가능), 프로젝트/일정/
-- 업무처럼 hospital_id로 표현 안 되는 컨텍스트를 위해 범용 컬럼 2개만 추가한다.
-- 고객 컨텍스트에서 저장하는 새 메모는 하위호환을 위해 hospital_id와 context_id를 동시에 채운다.

alter table public.consultation_memos
  add column if not exists context_type text,
  add column if not exists context_id uuid;

create index if not exists consultation_memos_context_idx
  on public.consultation_memos(context_type, context_id)
  where context_type is not null and context_id is not null;

notify pgrst, 'reload schema';
