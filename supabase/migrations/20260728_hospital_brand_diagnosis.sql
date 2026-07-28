-- 병원브랜드이미지 진단: 사진/영상뿐 아니라 홈페이지·플레이스·블로그·인스타그램·유튜브를 통해
-- 환자에게 전달되는 병원의 전체 온라인 인상을 진단하는 신규 통합 기능.
-- 기존 diagnosis_submissions, 채널 분석, 브랜드 분석 테이블은 전혀 건드리지 않는 additive migration이다.

create table if not exists public.hospital_brand_diagnoses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  hospital_name text not null default '',
  specialty text not null default '',
  region text not null default '',
  profile_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'collecting', 'waiting_manual_upload', 'analyzing', 'completed', 'failed')),
  overall_summary text not null default '',
  report_json jsonb,
  algorithm_version text not null default 'brand-diagnosis-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospital_brand_diagnosis_sources (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  channel text not null
    check (channel in ('website', 'naver_place', 'naver_blog', 'instagram', 'youtube', 'other')),
  url text not null default '',
  collection_method text not null default 'html'
    check (collection_method in ('html', 'api', 'browser', 'screenshot', 'uploaded_image', 'uploaded_video')),
  status text not null default 'pending'
    check (status in ('pending', 'collecting', 'complete', 'partial', 'failed', 'manual_required')),
  evidence_count integer not null default 0,
  limitations_json jsonb not null default '[]'::jsonb,
  snapshot_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hospital_brand_diagnosis_assets (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  channel text not null
    check (channel in ('website', 'naver_place', 'naver_blog', 'instagram', 'youtube', 'other')),
  category text,
  file_name text not null default '',
  storage_path text not null,
  mime_type text not null default '',
  file_size integer not null default 0,
  width integer,
  height integer,
  duration numeric,
  consent boolean not null default false,
  analysis_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hospital_brand_diagnosis_channel_results (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  channel text not null
    check (channel in ('website', 'naver_place', 'naver_blog', 'instagram', 'youtube', 'other')),
  scores_json jsonb not null default '{}'::jsonb,
  summary text not null default '',
  strengths_json jsonb not null default '[]'::jsonb,
  missing_information_json jsonb not null default '[]'::jsonb,
  immediate_actions_json jsonb not null default '[]'::jsonb,
  reusable_assets_json jsonb not null default '[]'::jsonb,
  unavailable_checks_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(diagnosis_id, channel)
);

create table if not exists public.hospital_brand_diagnosis_evidence (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  channel text not null
    check (channel in ('website', 'naver_place', 'naver_blog', 'instagram', 'youtube', 'other')),
  statement text not null,
  source_type text not null default 'html'
    check (source_type in ('html', 'api', 'browser', 'screenshot', 'uploaded_image', 'uploaded_video')),
  source_id text,
  reference text not null default '',
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  created_at timestamptz not null default now()
);

create index if not exists idx_hbd_sources_diagnosis_id
  on public.hospital_brand_diagnosis_sources(diagnosis_id);
create index if not exists idx_hbd_assets_diagnosis_id
  on public.hospital_brand_diagnosis_assets(diagnosis_id);
create index if not exists idx_hbd_channel_results_diagnosis_id
  on public.hospital_brand_diagnosis_channel_results(diagnosis_id);
create index if not exists idx_hbd_evidence_diagnosis_id
  on public.hospital_brand_diagnosis_evidence(diagnosis_id);
create index if not exists idx_hbd_diagnoses_client_id
  on public.hospital_brand_diagnoses(client_id);

drop trigger if exists hospital_brand_diagnoses_updated_at on public.hospital_brand_diagnoses;
create trigger hospital_brand_diagnoses_updated_at
  before update on public.hospital_brand_diagnoses
  for each row execute procedure public.set_updated_at();

alter table public.hospital_brand_diagnoses enable row level security;
alter table public.hospital_brand_diagnosis_sources enable row level security;
alter table public.hospital_brand_diagnosis_assets enable row level security;
alter table public.hospital_brand_diagnosis_channel_results enable row level security;
alter table public.hospital_brand_diagnosis_evidence enable row level security;

drop policy if exists "service role hbd diagnoses" on public.hospital_brand_diagnoses;
create policy "service role hbd diagnoses"
  on public.hospital_brand_diagnoses for all to service_role
  using (true) with check (true);

drop policy if exists "service role hbd sources" on public.hospital_brand_diagnosis_sources;
create policy "service role hbd sources"
  on public.hospital_brand_diagnosis_sources for all to service_role
  using (true) with check (true);

drop policy if exists "service role hbd assets" on public.hospital_brand_diagnosis_assets;
create policy "service role hbd assets"
  on public.hospital_brand_diagnosis_assets for all to service_role
  using (true) with check (true);

drop policy if exists "service role hbd channel results" on public.hospital_brand_diagnosis_channel_results;
create policy "service role hbd channel results"
  on public.hospital_brand_diagnosis_channel_results for all to service_role
  using (true) with check (true);

drop policy if exists "service role hbd evidence" on public.hospital_brand_diagnosis_evidence;
create policy "service role hbd evidence"
  on public.hospital_brand_diagnosis_evidence for all to service_role
  using (true) with check (true);

grant all on table public.hospital_brand_diagnoses to service_role;
grant all on table public.hospital_brand_diagnosis_sources to service_role;
grant all on table public.hospital_brand_diagnosis_assets to service_role;
grant all on table public.hospital_brand_diagnosis_channel_results to service_role;
grant all on table public.hospital_brand_diagnosis_evidence to service_role;

notify pgrst, 'reload schema';
