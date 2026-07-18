-- Olivia native channel analysis reports (additive migration)
create table if not exists public.channel_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  hospital_name text not null default '',
  specialty text not null default '',
  address text not null default '',
  input_urls jsonb not null default '{}'::jsonb,
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  overall_summary text not null default '',
  photo_opportunity text not null default '',
  channel_results jsonb not null default '{}'::jsonb,
  report_data jsonb not null default '{}'::jsonb,
  collection_summary jsonb not null default '{}'::jsonb,
  analysis_status text not null default 'completed'
    check (analysis_status in ('processing','completed','partial','failed')),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_channel_analysis_reports_client
  on public.channel_analysis_reports(client_id, created_at desc);
create index if not exists idx_channel_analysis_reports_workflow
  on public.channel_analysis_reports(workflow_run_id, created_at desc);
create index if not exists idx_channel_analysis_reports_created
  on public.channel_analysis_reports(created_at desc);

alter table public.channel_analysis_reports enable row level security;

drop policy if exists "service role manages channel analysis reports" on public.channel_analysis_reports;
create policy "service role manages channel analysis reports"
  on public.channel_analysis_reports
  for all
  to service_role
  using (true)
  with check (true);

grant all on public.channel_analysis_reports to service_role;
