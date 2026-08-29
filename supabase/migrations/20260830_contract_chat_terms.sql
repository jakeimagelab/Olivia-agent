-- Olivia PHASE 3 — 계약서 Chat-native Workflow.
-- 계약 전용 조건(계약금 비율, 잔금/납품/특약)이 지금은 ContractBuilder.tsx의
-- buildContractHtml() 안에 하드코딩된 템플릿 문자열이라 채팅으로 바꿀 저장소가 없다.
-- 값이 비어 있으면 그 기존 하드코딩 텍스트가 그대로 기본값으로 쓰이므로(코드 쪽에서 처리),
-- 여기서는 저장 컬럼만 additive로 추가한다.
alter table public.contracts
  add column if not exists status text not null default 'draft' check (status in ('draft', 'final')),
  add column if not exists deposit_rate numeric,
  add column if not exists payment_terms text,
  add column if not exists delivery_terms text,
  add column if not exists special_terms text;

-- 이미 포털에 공개된 계약서는 이번에 새로 생기는 draft/final 개념상 'final'로 보정한다
-- (기존 발행 로직은 그대로 두고, 새 컬럼의 초기값만 실제 상태와 맞춘다).
update public.contracts c set status = 'final'
where exists (
  select 1 from public.pcrm_publications p
  where p.related_type = 'contract' and p.related_id = c.id and p.status = 'published'
);

notify pgrst, 'reload schema';
