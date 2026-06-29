create table if not exists video_conti (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  title text not null default '제목 없음',
  hospital_name text,
  source_url text,
  brand_analysis jsonb,
  bgm_filename text,
  bgm_storage_path text,
  bgm_duration_seconds numeric,
  bgm_tempo_bpm numeric,
  bgm_key text,
  bgm_sections jsonb,
  scenes jsonb not null default '[]',
  status text default 'draft' check (status in ('draft','analyzing','ready','final')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists video_conti_shares (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  video_conti_id uuid references video_conti(id) on delete cascade,
  created_at timestamptz default now()
);
