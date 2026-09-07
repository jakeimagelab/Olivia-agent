-- 현장뷰(6단계)에서 "촬영 완료" 상태를 저장할 컬럼. 완료 안 된 첫 장면이 "현재 카드"가 된다
-- (별도 current_index 컬럼 없이 completed로만 파생시킨다).
alter table public.conti_scenes add column if not exists completed boolean not null default false;

notify pgrst, 'reload schema';
