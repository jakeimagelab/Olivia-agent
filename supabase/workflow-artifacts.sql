-- 견적서·계약서·콘티 PDF 원본을 고객 워크플로우에 연결합니다.
-- 기존 설치 환경에도 반복 실행할 수 있는 additive migration입니다.

create table if not exists public.workflow_artifacts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  workflow_run_id   uuid references public.workflow_runs(id) on delete set null,
  workflow_step_key text not null,
  document_type     text not null check (document_type in ('quote', 'contract', 'conti')),
  source_table      text not null,
  source_id         uuid not null,
  title             text not null default '',
  file_name         text not null,
  storage_path      text not null unique,
  mime_type         text not null default 'application/pdf',
  file_size         bigint not null default 0 check (file_size >= 0),
  status            text not null default 'ready' check (status in ('ready', 'upload_failed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_table, source_id, document_type)
);

create index if not exists idx_workflow_artifacts_client
  on public.workflow_artifacts(client_id, created_at desc);
create index if not exists idx_workflow_artifacts_run
  on public.workflow_artifacts(workflow_run_id, created_at desc);
create index if not exists idx_workflow_artifacts_type
  on public.workflow_artifacts(document_type, created_at desc);

alter table public.quotes
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;
alter table public.contracts
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;
alter table public.conti_saves
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;

create index if not exists idx_quotes_workflow_run_id on public.quotes(workflow_run_id);
create index if not exists idx_contracts_client_id on public.contracts(client_id);
create index if not exists idx_contracts_workflow_run_id on public.contracts(workflow_run_id);
create index if not exists idx_conti_saves_client_id on public.conti_saves(client_id);
create index if not exists idx_conti_saves_workflow_run_id on public.conti_saves(workflow_run_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workflow-artifacts', 'workflow-artifacts', false, 26214400, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.workflow_artifacts enable row level security;
drop policy if exists "service role full access workflow artifacts" on public.workflow_artifacts;
create policy "service role full access workflow artifacts"
  on public.workflow_artifacts for all to service_role
  using (true) with check (true);

grant all on table public.workflow_artifacts to service_role;
notify pgrst, 'reload schema';
