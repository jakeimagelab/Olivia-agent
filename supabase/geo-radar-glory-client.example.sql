-- 선택 실행용: 글로리의원을 기존 clients에 등록하고 GEO 레이더 프로젝트를 준비한다.
-- 반드시 아래 두 스키마 적용 후, 운영자가 내용을 확인하고 직접 실행한다.
--   1) supabase/ai-trust-gap-schema.sql
--   2) supabase/geo-radar-v1.sql

begin;

with existing_client as (
  select id
  from clients
  where hospital_name = '글로리의원'
  order by created_at asc
  limit 1
), inserted_client as (
  insert into clients (hospital_name, specialty, memo)
  select
    '글로리의원',
    '피부과',
    '서울 강남구 봉은사로 207 KJ빌딩 3층 · 언주역'
  where not exists (select 1 from existing_client)
  returning id
), target_client as (
  select id from existing_client
  union all
  select id from inserted_client
  limit 1
), target_region as (
  select id from ai_trust_regions where name = '언주역 부근' limit 1
)
insert into ai_trust_projects (
  client_id,
  project_name,
  client_hospital_name,
  region,
  region_id,
  scope_label,
  department,
  treatments,
  status
)
select
  target_client.id,
  '글로리의원 GEO 레이더',
  '글로리의원',
  '언주역 부근',
  target_region.id,
  '언주역 부근 1km',
  '피부과',
  array['울쎄라','써마지','세르프','리쥬란'],
  'DRAFT'
from target_client cross join target_region
where not exists (
  select 1 from ai_trust_projects
  where client_id = target_client.id and project_name = '글로리의원 GEO 레이더'
);

commit;
