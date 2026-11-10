-- GEO 레이더 v1
-- 적용 순서:
--   1) supabase/ai-trust-gap-schema.sql
--   2) 이 파일(supabase/geo-radar-v1.sql)
--
-- 운영 데이터 삭제/초기화 없음. 기존 ai_trust_* 테이블과 행을 유지하며 확장만 한다.

begin;

create extension if not exists "pgcrypto";

alter table ai_trust_projects
  add column if not exists region_id uuid,
  add column if not exists scope_label text,
  add column if not exists monthly_budget_usd numeric(12,4) not null default 20,
  add column if not exists latest_viewed_at timestamptz;

alter table ai_trust_audit_runs
  add column if not exists question_count int not null default 0,
  add column if not exists estimated_cost_usd numeric(12,6) not null default 0,
  add column if not exists actual_cost_usd numeric(12,6) not null default 0,
  add column if not exists template_version text not null default 'geo-radar-v1';

alter table ai_trust_ai_responses
  add column if not exists request_parameters jsonb not null default '{}'::jsonb,
  add column if not exists input_tokens int,
  add column if not exists output_tokens int,
  add column if not exists web_search_count int not null default 0,
  add column if not exists expires_at timestamptz not null default (now() + interval '180 days');

alter table ai_trust_hospital_mentions
  add column if not exists source_url text,
  add column if not exists match_confidence numeric,
  add column if not exists match_status text not null default 'PENDING'
    check (match_status in ('PENDING','MATCHED','REVIEW','IGNORED'));

create table if not exists ai_trust_regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  region_type text not null check (region_type in ('radius','districts','city','custom')),
  center_lat double precision,
  center_lng double precision,
  radius_m int check (radius_m is null or radius_m between 100 and 20000),
  districts text[] not null default '{}',
  region_terms text[] not null default '{}',
  boundary_geojson_path text,
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ai_trust_projects
  drop constraint if exists ai_trust_projects_region_id_fkey;
alter table ai_trust_projects
  add constraint ai_trust_projects_region_id_fkey foreign key (region_id)
    references ai_trust_regions(id) on delete set null;

create table if not exists ai_trust_clinics (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null,
  clinic_type text,
  department_code text,
  address text not null,
  latitude double precision,
  longitude double precision,
  district text,
  website text,
  phone text,
  source text not null check (source in ('hira','kakao','manual','merged')),
  source_id text,
  source_payload jsonb not null default '{}'::jsonb,
  first_collected_at timestamptz not null default now(),
  last_collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_trust_clinics_source_unique
  on ai_trust_clinics(source, source_id) where source_id is not null;
create index if not exists ai_trust_clinics_normalized_name_idx on ai_trust_clinics(normalized_name);
create index if not exists ai_trust_clinics_district_idx on ai_trust_clinics(district);

alter table ai_trust_hospital_mentions
  add column if not exists matched_clinic_id uuid references ai_trust_clinics(id) on delete set null;

create table if not exists ai_trust_clinic_aliases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references ai_trust_clinics(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text not null default 'review',
  created_at timestamptz not null default now(),
  unique (clinic_id, normalized_alias)
);
create index if not exists ai_trust_clinic_aliases_normalized_idx on ai_trust_clinic_aliases(normalized_alias);

create table if not exists ai_trust_project_clinics (
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  clinic_id uuid not null references ai_trust_clinics(id) on delete cascade,
  distance_m int,
  is_client boolean not null default false,
  website_verified boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, clinic_id)
);
create index if not exists ai_trust_project_clinics_clinic_idx on ai_trust_project_clinics(clinic_id);

create table if not exists ai_trust_review_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  response_id uuid references ai_trust_ai_responses(id) on delete cascade,
  mention_id uuid references ai_trust_hospital_mentions(id) on delete cascade,
  raw_name text not null,
  proposed_clinic_id uuid references ai_trust_clinics(id) on delete set null,
  confidence numeric,
  status text not null default 'PENDING' check (status in ('PENDING','MATCHED','CREATED','IGNORED')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_trust_review_queue_status_idx on ai_trust_review_queue(status, created_at);
create index if not exists ai_trust_review_queue_project_idx on ai_trust_review_queue(project_id, status);

create table if not exists ai_trust_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references ai_trust_projects(id) on delete cascade,
  run_id uuid references ai_trust_audit_runs(id) on delete cascade,
  audit_request_id uuid references ai_trust_audit_requests(id) on delete cascade,
  job_type text not null check (job_type in ('ai_query','clinic_sync','extract','score','retention')),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','RETRY','COMPLETED','FAILED','PAUSED')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  error text,
  cost_usd numeric(12,6) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_trust_jobs_claim_idx
  on ai_trust_jobs(status, next_run_at, created_at)
  where status in ('PENDING','RETRY','RUNNING');
create index if not exists ai_trust_jobs_project_idx on ai_trust_jobs(project_id, created_at desc);
create index if not exists ai_trust_jobs_run_idx on ai_trust_jobs(run_id, status);

create table if not exists ai_trust_cost_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references ai_trust_projects(id) on delete set null,
  run_id uuid references ai_trust_audit_runs(id) on delete set null,
  job_id uuid references ai_trust_jobs(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_search_count int not null default 0,
  input_price_per_million numeric(12,6) not null default 0,
  output_price_per_million numeric(12,6) not null default 0,
  web_search_price numeric(12,6) not null default 0,
  amount_usd numeric(12,6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_trust_cost_ledger_project_month_idx
  on ai_trust_cost_ledger(project_id, created_at desc);
create index if not exists ai_trust_cost_ledger_provider_month_idx
  on ai_trust_cost_ledger(provider, created_at desc);

create table if not exists ai_trust_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into ai_trust_settings(key, value, description) values
  ('budgets', '{"project_monthly_usd":20,"global_monthly_usd":100,"warning_ratio":0.8}'::jsonb,
   'GEO 레이더 월 예산 기본값. 환경변수 AI_TRUST_GLOBAL_MONTHLY_BUDGET_USD가 전체 한도를 덮어쓴다.'),
  ('pricing', '{"openai":{"input_per_million":4,"output_per_million":20,"web_search":0.01},"gemini":{"input_per_million":2,"output_per_million":12,"web_search":0.014},"anthropic":{"input_per_million":2,"output_per_million":10,"web_search":0.01},"perplexity":{"input_per_million":1,"output_per_million":5,"web_search":0.01}}'::jsonb,
   '2026-11-11 공식 도구 가격과 보수적 모델 단가를 사용한 예상치. 선택한 모델에 맞춰 운영자가 갱신하며 Perplexity Agent API의 실제 보고 비용이 장부에서 우선한다.'),
  ('pricing_meta', '{"checked_at":"2026-11-11","openai":"https://developers.openai.com/api/docs/pricing","gemini":"https://ai.google.dev/gemini-api/docs/pricing","anthropic":"https://platform.claude.com/docs/en/about-claude/pricing","perplexity":"https://docs.perplexity.ai/api-reference/agent-post"}'::jsonb,
   '단가 확인일과 공식 문서. 모델별 단가는 운영 모델 변경 시 함께 갱신한다.'),
  ('models', '{}'::jsonb, '환경변수가 없을 때 사용할 Provider별 모델. 운영자가 명시적으로 설정한다.'),
  ('worker', '{"cron_minutes":5,"batch_size":2,"lease_minutes":10}'::jsonb,
   '작업 처리 주기와 한 번에 처리할 수, 잠금 만료 시간. Vercel Cron은 이 값과 같은 5분 간격으로 설정한다.'),
  ('retention', '{"raw_response_days":180}'::jsonb, 'AI 원문 응답 보관 기간')
on conflict (key) do nothing;

insert into ai_trust_regions(name, region_type, center_lat, center_lng, radius_m, districts, region_terms, boundary_geojson_path, is_preset)
values
  ('언주역 부근', 'radius', 37.507287, 127.033868, 1000, '{}', array['언주역','논현동','신논현','선릉','역삼'], null, true),
  ('강남권', 'districts', 37.514575, 127.049555, null, array['강남구','서초구','송파구'], array['강남','신사','압구정','청담','신논현','선릉','잠실'], '/geo/seoul-south-east-districts.geojson', true),
  ('서울', 'city', 37.566535, 126.977969, null, array['서울특별시'], array['서울'], '/geo/seoul-boundary.geojson', true)
on conflict (name) do update set
  region_type = excluded.region_type,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  radius_m = excluded.radius_m,
  districts = excluded.districts,
  region_terms = excluded.region_terms,
  boundary_geojson_path = excluded.boundary_geojson_path,
  is_preset = true,
  updated_at = now();

-- Exposed public schema tables are server-only. No anon/authenticated policies are created.
alter table ai_trust_regions enable row level security;
alter table ai_trust_clinics enable row level security;
alter table ai_trust_clinic_aliases enable row level security;
alter table ai_trust_project_clinics enable row level security;
alter table ai_trust_review_queue enable row level security;
alter table ai_trust_jobs enable row level security;
alter table ai_trust_cost_ledger enable row level security;
alter table ai_trust_settings enable row level security;

revoke all on table ai_trust_regions from anon, authenticated;
revoke all on table ai_trust_clinics from anon, authenticated;
revoke all on table ai_trust_clinic_aliases from anon, authenticated;
revoke all on table ai_trust_project_clinics from anon, authenticated;
revoke all on table ai_trust_review_queue from anon, authenticated;
revoke all on table ai_trust_jobs from anon, authenticated;
revoke all on table ai_trust_cost_ledger from anon, authenticated;
revoke all on table ai_trust_settings from anon, authenticated;

commit;

