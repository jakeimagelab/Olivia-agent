-- 포털 중심 자동 워크플로우 개편 1차 (견적→계약→콘티) 마이그레이션
-- quotes.workflow_run_id / contracts.client_id / contracts.workflow_run_id는
-- 이미 supabase/workflow-artifacts.sql에서 추가되어 있어 여기서는 건드리지 않는다.
-- 새로 필요한 것은 사업자등록번호 기반 고객 매칭용 컬럼뿐이다.

alter table public.clients add column if not exists business_registration_number text;
alter table public.quotes  add column if not exists business_registration_number text;

-- 견적 공개로 자동 생성된 고객의 초기 상태(lead) → 계약 서명 후(contracted)로 전환하기 위한 컬럼.
-- 기존 clients.workflow_status는 더 이상 코드에서 읽지 않는 컬럼이라 재사용하지 않고 새로 둔다.
alter table public.clients add column if not exists lead_status text not null default 'lead'
  check (lead_status in ('lead', 'prospect', 'contracted', 'active_client'));

create index if not exists idx_clients_business_registration_number
  on public.clients(business_registration_number)
  where business_registration_number is not null and business_registration_number <> '';

notify pgrst, 'reload schema';
