-- 고객관리 개편: 등록/수정 폼에 추가되는 선택 필드들.
-- clients 테이블의 실제 컬럼명은 hospital_name/contact_name/specialty 체계이므로
-- (app/api/clients/route.ts 기준) 그 관례를 따라 컬럼을 추가한다.
alter table public.clients
  add column if not exists address           text default '',
  add column if not exists website_url       text default '',
  add column if not exists instagram_url     text default '',
  add column if not exists naver_place_url   text default '',
  add column if not exists manager_staff     text default '',
  add column if not exists referral_source   text default '',
  add column if not exists notes             text default '';

-- 고객 목록 필터(진료과/담당 매니저)용 인덱스
create index if not exists idx_clients_specialty on public.clients(specialty);
create index if not exists idx_clients_manager_staff on public.clients(manager_staff);
