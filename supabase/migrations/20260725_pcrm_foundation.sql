-- PCRM foundation: workflow_runs를 고객 프로젝트로 확장하고
-- 프로젝트 단위 고객 포털, 공개 상태, 활동 기록을 추가한다.
-- 기존 테이블과 데이터는 삭제하지 않는 additive migration이다.

alter table public.workflow_runs
  add column if not exists project_type text,
  add column if not exists shooting_type text,
  add column if not exists owner_name text default '',
  add column if not exists consultation_date date,
  add column if not exists start_date date,
  add column if not exists expected_completion_date date,
  add column if not exists expected_contract_amount bigint,
  add column if not exists project_memo text default '';

alter table public.client_portal_access
  add column if not exists workflow_run_id uuid
    references public.workflow_runs(id) on delete cascade,
  add column if not exists access_count integer not null default 0;

alter table public.client_portal_events
  add column if not exists workflow_run_id uuid
    references public.workflow_runs(id) on delete set null;

create index if not exists idx_cpa_workflow_run
  on public.client_portal_access(workflow_run_id, is_active, created_at desc);
create index if not exists idx_cpe_workflow_run
  on public.client_portal_events(workflow_run_id, created_at desc);

create table if not exists public.pcrm_publications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  related_type text not null,
  related_id text not null,
  title text not null default '',
  description text not null default '',
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in (
      'draft', 'internal_review', 'published', 'viewed',
      'revision_requested', 'approved', 'completed', 'archived'
    )),
  published_at timestamptz,
  viewed_at timestamptz,
  approved_at timestamptz,
  revision_requested_at timestamptz,
  completed_at timestamptz,
  feedback text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, related_type, related_id, version)
);

create table if not exists public.pcrm_activity_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  actor_type text not null default 'system'
    check (actor_type in ('admin', 'client', 'system')),
  actor_name text not null default '',
  action_type text not null,
  title text not null,
  description text not null default '',
  related_type text not null default '',
  related_id text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_pcrm_publications_project
  on public.pcrm_publications(workflow_run_id, status, updated_at desc);
create index if not exists idx_pcrm_publications_client
  on public.pcrm_publications(client_id, updated_at desc);
create index if not exists idx_pcrm_activity_project
  on public.pcrm_activity_logs(workflow_run_id, created_at desc);
create index if not exists idx_pcrm_activity_client
  on public.pcrm_activity_logs(client_id, created_at desc);

drop trigger if exists pcrm_publications_updated_at on public.pcrm_publications;
create trigger pcrm_publications_updated_at
  before update on public.pcrm_publications
  for each row execute procedure public.set_updated_at();

alter table public.pcrm_publications enable row level security;
alter table public.pcrm_activity_logs enable row level security;

drop policy if exists "service role pcrm publications" on public.pcrm_publications;
create policy "service role pcrm publications"
  on public.pcrm_publications for all to service_role
  using (true) with check (true);

drop policy if exists "service role pcrm activity logs" on public.pcrm_activity_logs;
create policy "service role pcrm activity logs"
  on public.pcrm_activity_logs for all to service_role
  using (true) with check (true);

grant all on table public.pcrm_publications to service_role;
grant all on table public.pcrm_activity_logs to service_role;

notify pgrst, 'reload schema';
