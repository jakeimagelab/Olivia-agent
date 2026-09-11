-- Olivia가 고객 등록 전에 만든 문서를 한 곳에서 추적하는 공통 임시문서 인덱스입니다.
-- 원본 내용은 quotes/contracts/conti_runs/workflow_artifacts에 유지하며 여기에는 참조만 저장합니다.

create table if not exists public.temporary_documents (
  id                uuid primary key default gen_random_uuid(),
  document_type     text not null
                    check (document_type in ('quote', 'contract', 'conti', 'report', 'checklist', 'revision', 'project_document')),
  source_table      text not null check (source_table in ('quotes', 'contracts', 'conti_runs', 'workflow_artifacts')),
  source_id         uuid not null,
  title             text not null default '',
  hospital_name     text not null default '',
  client_id         uuid references public.clients(id) on delete set null,
  workflow_run_id   uuid references public.workflow_runs(id) on delete set null,
  status            text not null default 'pending_review'
                    check (status in ('pending_review', 'content_approved', 'pending_client', 'linked', 'archived', 'failed')),
  preview_url       text,
  metadata          jsonb not null default '{}'::jsonb,
  linked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_table, source_id)
);

create index if not exists idx_temporary_documents_open
  on public.temporary_documents(updated_at desc)
  where status in ('pending_review', 'content_approved', 'pending_client', 'failed');
create index if not exists idx_temporary_documents_hospital
  on public.temporary_documents(hospital_name, updated_at desc);
create index if not exists idx_temporary_documents_client
  on public.temporary_documents(client_id, updated_at desc);

alter table public.temporary_documents enable row level security;
drop policy if exists "service role full access temporary documents" on public.temporary_documents;
create policy "service role full access temporary documents"
  on public.temporary_documents for all to service_role
  using (true) with check (true);

grant all on table public.temporary_documents to service_role;

alter table public.conti_runs
  add column if not exists hospital_name text not null default '',
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;

insert into public.temporary_documents (document_type, source_table, source_id, title, hospital_name, status, metadata)
select 'quote', 'quotes', q.id, coalesce(nullif(q.title, ''), q.hospital_name || ' 견적서'), q.hospital_name, 'pending_review',
       jsonb_build_object('quoteNumber', q.quote_number, 'totalAmount', q.total_amount, 'backfilled', true)
from public.quotes q
where q.client_id is null
on conflict (source_table, source_id) do nothing;

insert into public.temporary_documents (document_type, source_table, source_id, title, hospital_name, status, metadata)
select 'contract', 'contracts', c.id, c.hospital_name || ' 계약서', c.hospital_name, 'pending_review',
       jsonb_build_object('quoteNumber', c.quote_number, 'backfilled', true)
from public.contracts c
where c.client_id is null
on conflict (source_table, source_id) do nothing;

insert into public.temporary_documents (document_type, source_table, source_id, title, hospital_name, status, metadata)
select 'conti', 'conti_runs', r.id, coalesce(nullif(r.hospital_name, ''), '미지정 병원') || ' 촬영 콘티', r.hospital_name, 'pending_review',
       jsonb_build_object('specialty', r.specialty, 'backfilled', true)
from public.conti_runs r
where r.hospital_id is null and r.hospital_name <> ''
on conflict (source_table, source_id) do nothing;

notify pgrst, 'reload schema';
