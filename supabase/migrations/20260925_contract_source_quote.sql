-- Olivia 3.0 Phase 2: 계약서가 어떤 확정 견적에서 생성됐는지 추적합니다.
-- source_quote_id가 없는 기존 계약은 그대로 두고, Core가 새로 만드는 계약만
-- workflow_run_id별 한 건으로 제한합니다.

alter table public.contracts
  add column if not exists source_quote_id uuid references public.quotes(id) on delete set null;

create index if not exists idx_contracts_source_quote_id
  on public.contracts(source_quote_id)
  where source_quote_id is not null;

create unique index if not exists uq_contracts_core_workflow_run
  on public.contracts(workflow_run_id)
  where workflow_run_id is not null and source_quote_id is not null;

notify pgrst, 'reload schema';
