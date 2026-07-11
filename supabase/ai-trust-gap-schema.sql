-- AI TRUST GAP / AI 추천 병원 역분석
-- 검색량이 없는 수요 데이터는 0이 아니라 NULL로 저장한다.

create extension if not exists "pgcrypto";

create table if not exists ai_trust_projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  project_name text not null,
  client_hospital_name text not null,
  region text not null,
  department text not null,
  treatments text[] not null default '{}',
  symptoms text[] not null default '{}',
  target_age text,
  target_gender text,
  target_countries text[] not null default '{}',
  target_languages text[] not null default '{}',
  competitor_hospitals text[] not null default '{}',
  memo text,
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING','RUNNING','PAUSED','COMPLETED','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_trust_data_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  source_key text not null,
  source_name text not null,
  status text not null check (status in ('CONNECTED','NOT_CONNECTED','API_REQUIRED','MANUAL_DATA')),
  message text,
  checked_at timestamptz not null default now(),
  unique (project_id, source_key)
);

create table if not exists ai_trust_demand_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  keyword text not null,
  source text not null,
  volume numeric null,
  data_type text not null,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now()
);

create table if not exists ai_trust_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  demand_item_id uuid references ai_trust_demand_items(id) on delete set null,
  source_keyword text not null,
  source text not null,
  intent text not null check (intent in ('LOCATION','RECOMMENDATION','SYMPTOM','TREATMENT','PRICE','TRUST','CONDITION')),
  question text not null,
  language text not null default 'ko',
  region text not null,
  department text not null,
  demand_score numeric null,
  selected boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ai_trust_audit_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','PAUSED','COMPLETED','FAILED')),
  providers text[] not null default '{}',
  repeat_count int not null default 5 check (repeat_count between 1 and 20),
  total_requests int not null default 0,
  completed_requests int not null default 0,
  failed_requests int not null default 0,
  current_prompt_id uuid,
  current_provider text,
  pricing_note text not null default 'Provider Pricing 설정 필요',
  settings jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ai_trust_audit_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai_trust_audit_runs(id) on delete cascade,
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  prompt_id uuid not null references ai_trust_prompts(id) on delete cascade,
  provider text not null,
  run_number int not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED')),
  response_id uuid,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, prompt_id, provider, run_number)
);

create table if not exists ai_trust_ai_responses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references ai_trust_audit_runs(id) on delete cascade,
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  prompt_id uuid not null references ai_trust_prompts(id) on delete cascade,
  provider text not null,
  model text,
  run_number int not null,
  question text not null,
  raw_response text not null,
  citations jsonb not null default '[]'::jsonb,
  source_urls text[] not null default '{}',
  executed_at timestamptz not null default now(),
  response_status text not null default 'COMPLETED' check (response_status in ('COMPLETED','FAILED','SKIPPED')),
  error_message text
);

create table if not exists ai_trust_hospitals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  canonical_name text not null,
  aliases text[] not null default '{}',
  website text,
  address text,
  region text,
  department text,
  normalization_status text not null default 'AUTO' check (normalization_status in ('AUTO','CONFIRMED','MERGED','IGNORED')),
  created_at timestamptz not null default now(),
  unique (project_id, canonical_name)
);

create table if not exists ai_trust_hospital_mentions (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references ai_trust_ai_responses(id) on delete cascade,
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  hospital_id uuid references ai_trust_hospitals(id) on delete set null,
  raw_name text not null,
  rank int,
  mention_context text not null check (mention_context in ('RECOMMENDED','NEUTRAL','NEGATIVE','COMPARISON')),
  confidence numeric null,
  snippet text
);

create table if not exists ai_trust_consensus_stats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  hospital_id uuid not null references ai_trust_hospitals(id) on delete cascade,
  mention_rate numeric not null default 0,
  top1_rate numeric not null default 0,
  top3_rate numeric not null default 0,
  provider_consensus int not null default 0,
  intent_coverage int not null default 0,
  repeat_stability numeric not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (project_id, hospital_id)
);

create table if not exists ai_trust_evidence_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  hospital_id uuid references ai_trust_hospitals(id) on delete cascade,
  source_type text not null,
  source_name text,
  url text,
  title text,
  text text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  content_hash text not null,
  raw_data jsonb not null default '{}'::jsonb,
  unique (project_id, content_hash)
);

create table if not exists ai_trust_evidence_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  hospital_id uuid references ai_trust_hospitals(id) on delete cascade,
  document_id uuid not null references ai_trust_evidence_documents(id) on delete cascade,
  schema_key text not null,
  evidence_quote text,
  interpretation text,
  consistency text check (consistency in ('LOW','MEDIUM','HIGH')),
  created_at timestamptz not null default now()
);

create table if not exists ai_trust_schema_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  hospital_id uuid references ai_trust_hospitals(id) on delete cascade,
  schema_key text not null,
  score numeric not null check (score >= 0 and score <= 100),
  breakdown jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (project_id, hospital_id, schema_key)
);

create table if not exists ai_trust_patterns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  schema_key text not null,
  recommended_avg numeric not null default 0,
  comparison_avg numeric null,
  observation text not null,
  evidence jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (project_id, schema_key)
);

create table if not exists ai_trust_gaps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  schema_key text not null,
  recommended_avg numeric not null default 0,
  client_score numeric not null default 0,
  gap numeric not null default 0,
  rank int not null default 0,
  rationale jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  unique (project_id, schema_key)
);

create table if not exists ai_trust_strategies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  title text not null,
  category text not null,
  priority int not null default 3,
  summary text not null,
  rationale jsonb not null default '[]'::jsonb,
  linked_gap_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists ai_trust_shoot_plan (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references ai_trust_projects(id) on delete cascade,
  strategy_id uuid references ai_trust_strategies(id) on delete set null,
  title text not null,
  description text,
  evidence_schema text not null,
  trust_gap text not null,
  shot_type text not null check (shot_type in ('MOOD','EVIDENCE','TEXT_SUPPORT')),
  priority int not null default 3,
  photo_required boolean not null default true,
  video_required boolean not null default false,
  linked_conti_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_trust_projects_client on ai_trust_projects(client_id);
create index if not exists idx_ai_trust_prompts_project on ai_trust_prompts(project_id);
create index if not exists idx_ai_trust_audit_requests_run on ai_trust_audit_requests(run_id, status);
create index if not exists idx_ai_trust_responses_project on ai_trust_ai_responses(project_id);
create index if not exists idx_ai_trust_mentions_project on ai_trust_hospital_mentions(project_id);
create index if not exists idx_ai_trust_evidence_project on ai_trust_evidence_documents(project_id);
create index if not exists idx_ai_trust_gaps_project on ai_trust_gaps(project_id, rank);

alter table ai_trust_projects enable row level security;
alter table ai_trust_data_sources enable row level security;
alter table ai_trust_demand_items enable row level security;
alter table ai_trust_prompts enable row level security;
alter table ai_trust_audit_runs enable row level security;
alter table ai_trust_audit_requests enable row level security;
alter table ai_trust_ai_responses enable row level security;
alter table ai_trust_hospitals enable row level security;
alter table ai_trust_hospital_mentions enable row level security;
alter table ai_trust_consensus_stats enable row level security;
alter table ai_trust_evidence_documents enable row level security;
alter table ai_trust_evidence_facts enable row level security;
alter table ai_trust_schema_scores enable row level security;
alter table ai_trust_patterns enable row level security;
alter table ai_trust_gaps enable row level security;
alter table ai_trust_strategies enable row level security;
alter table ai_trust_shoot_plan enable row level security;
