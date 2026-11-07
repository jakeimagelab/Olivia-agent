-- Bridge collaboration permissions, per-photo messages, shared photo quality analysis,
-- and auditable NAS download jobs. Existing selections and files are never rewritten.

alter table public.person_select_events
  add column if not exists customer_ai_results_visible boolean not null default false;

alter table public.person_select_shared_reviewers
  add column if not exists can_view_ai_results boolean not null default false,
  add column if not exists can_download_jpg boolean not null default false,
  add column if not exists can_download_raw boolean not null default false,
  add column if not exists can_finalize boolean not null default false;

-- Preserve the behavior of every link that existed before permissions were added.
-- Newly created reviewers keep the conservative false defaults until an admin grants them.
update public.person_select_shared_reviewers set can_finalize = true;

alter table public.person_select_project_messages
  add column if not exists image_id uuid references public.person_select_images(id) on delete cascade;

create index if not exists person_select_project_messages_event_image_created_idx
  on public.person_select_project_messages(event_id, image_id, created_at, id);

create table if not exists public.photo_quality_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  requested_by text not null default 'admin',
  analysis_version text not null,
  model text not null,
  status text not null default 'queued',
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  remote_job_id uuid references public.remote_jobs(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('queued','running','paused','completed','partial_failed','failed','canceled')),
  check (total_count >= 0 and completed_count >= 0 and failed_count >= 0)
);

create unique index if not exists photo_quality_analysis_jobs_one_active_event_idx
  on public.photo_quality_analysis_jobs(event_id)
  where status in ('queued','running','paused');
create index if not exists photo_quality_analysis_jobs_event_created_idx
  on public.photo_quality_analysis_jobs(event_id, created_at desc);

create table if not exists public.photo_quality_analysis_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  image_id uuid not null references public.person_select_images(id) on delete cascade,
  content_fingerprint text not null,
  analysis_version text not null,
  model text not null,
  analysis_status text not null,
  flags text[] not null default '{}',
  confidence jsonb not null default '{}'::jsonb,
  local_metrics jsonb not null default '{}'::jsonb,
  explanation jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz,
  reviewed_by text,
  review_status text not null default 'unreviewed',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(image_id, content_fingerprint, analysis_version),
  check (analysis_status in ('pending','analyzing','normal','suspected','needs_review','failed')),
  check (review_status in ('unreviewed','confirmed_issue','confirmed_normal')),
  check (flags <@ array['eyes_closed','face_too_dark','motion_blur']::text[])
);

create index if not exists photo_quality_analysis_results_event_status_idx
  on public.photo_quality_analysis_results(event_id, analysis_status, image_id);
create index if not exists photo_quality_analysis_results_event_review_idx
  on public.photo_quality_analysis_results(event_id, review_status, image_id);
create index if not exists photo_quality_analysis_results_flags_gin_idx
  on public.photo_quality_analysis_results using gin(flags);

create table if not exists public.photo_quality_analysis_job_items (
  job_id uuid not null references public.photo_quality_analysis_jobs(id) on delete cascade,
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  image_id uuid not null references public.person_select_images(id) on delete cascade,
  status text not null default 'queued',
  attempts smallint not null default 0,
  result_id uuid references public.photo_quality_analysis_results(id) on delete set null,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  primary key(job_id, image_id),
  check (status in ('queued','running','completed','failed','skipped')),
  check (attempts between 0 and 10)
);

create index if not exists photo_quality_analysis_job_items_claim_idx
  on public.photo_quality_analysis_job_items(job_id, status, image_id);

create table if not exists public.person_select_download_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  reviewer_id uuid references public.person_select_shared_reviewers(id) on delete set null,
  format text not null default 'jpg',
  image_ids uuid[] not null default '{}',
  request_key text not null,
  status text not null default 'queued',
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  remote_job_id uuid references public.remote_jobs(id) on delete set null,
  storage_path text,
  error text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, reviewer_id, request_key),
  check (format in ('jpg','raw')),
  check (status in ('queued','running','completed','partial_failed','failed','canceled','expired')),
  check (cardinality(image_ids) between 1 and 5000)
);

create index if not exists person_select_download_jobs_event_created_idx
  on public.person_select_download_jobs(event_id, created_at desc);

create table if not exists public.person_select_download_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  reviewer_id uuid references public.person_select_shared_reviewers(id) on delete set null,
  download_job_id uuid references public.person_select_download_jobs(id) on delete set null,
  action text not null,
  image_count integer not null default 0,
  request_ip_hash text,
  created_at timestamptz not null default now(),
  check (action in ('requested','link_issued','downloaded','failed'))
);

create index if not exists person_select_download_audit_event_created_idx
  on public.person_select_download_audit(event_id, created_at desc);

alter table public.photo_quality_analysis_jobs enable row level security;
alter table public.photo_quality_analysis_results enable row level security;
alter table public.photo_quality_analysis_job_items enable row level security;
alter table public.person_select_download_jobs enable row level security;
alter table public.person_select_download_audit enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'photo_quality_analysis_jobs',
    'photo_quality_analysis_results',
    'photo_quality_analysis_job_items',
    'person_select_download_jobs',
    'person_select_download_audit'
  ] loop
    execute format('drop policy if exists "service role full access %1$s" on public.%1$I', table_name);
    execute format('create policy "service role full access %1$s" on public.%1$I for all to service_role using (true) with check (true)', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

-- Only Realtime publishes message inserts. Public clients still subscribe through
-- authenticated SSE endpoints and never receive direct table access.
do $$ begin
  alter publication supabase_realtime add table public.person_select_project_messages;
exception when duplicate_object then null;
end $$;
