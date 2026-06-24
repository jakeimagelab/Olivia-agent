-- clients 테이블 컬럼 추가 (고객관리 통합 구조)
-- Supabase SQL Editor에서 실행하세요.

alter table clients add column if not exists director_name text;
alter table clients add column if not exists main_treatments text;
alter table clients add column if not exists doctor_count integer;
alter table clients add column if not exists special_notes text;
