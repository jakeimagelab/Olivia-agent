-- ── 고객(병원) 관리 ─────────────────────────────────────────
create table if not exists public.clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  manager_name     text default '',
  phone            text default '',
  email            text default '',
  department       text default '',
  website_url      text default '',
  instagram_url    text default '',
  blog_url         text default '',
  naver_place_url  text default '',
  memo             text default '',
  subscription_status text default 'none' check (subscription_status in ('none','active','paused','cancelled')),
  workflow_status  text default '상담완료',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 상담 메모 ────────────────────────────────────────────────
create table if not exists public.consultation_memos (
  id                  uuid primary key default gen_random_uuid(),
  hospital_id         uuid references public.clients(id) on delete set null,
  raw_memo            text not null default '',
  summary             text default '',
  extracted_data      jsonb default '{}'::jsonb,
  recommended_package text default '',
  next_action         text default '',
  created_at          timestamptz not null default now()
);

-- ── galleries 확장 컬럼 ──────────────────────────────────────
-- (기존 galleries 테이블이 있다면 아래 컬럼 추가, 없다면 새로 생성)
create table if not exists public.galleries (
  id                   uuid primary key default gen_random_uuid(),
  hospital_id          uuid references public.clients(id) on delete set null,
  hospital_name        text not null default '',
  contact_name         text default '',
  contact_email        text default '',
  shoot_date           date,
  title                text default '',
  shooting_items       text default '',
  nas_link             text default '',
  original_link        text default '',
  retouched_link       text default '',
  gallery_link         text default '',
  original_delivered   boolean default false,
  retouched_delivered  boolean default false,
  retouched_count      int default 0,
  client_confirmed     boolean default false,
  revision_requested   boolean default false,
  review_requested     boolean default false,
  description          text default '',
  status               text default '갤러리생성',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 진단 이미지 업로드 ───────────────────────────────────────
create table if not exists public.diagnosis_uploads (
  id           uuid primary key default gen_random_uuid(),
  diagnosis_id text default '',
  hospital_id  uuid references public.clients(id) on delete set null,
  category     text not null default '',
  file_name    text not null default '',
  file_url     text default '',
  size         bigint default 0,
  created_at   timestamptz not null default now()
);

-- updated_at 트리거
drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

drop trigger if exists galleries_updated_at on public.galleries;
create trigger galleries_updated_at
  before update on public.galleries
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.clients              enable row level security;
alter table public.consultation_memos   enable row level security;
alter table public.galleries            enable row level security;
alter table public.diagnosis_uploads    enable row level security;

create policy "service role clients"            on public.clients            for all using (true) with check (true);
create policy "service role consultation_memos" on public.consultation_memos for all using (true) with check (true);
create policy "service role galleries"          on public.galleries          for all using (true) with check (true);
create policy "service role diagnosis_uploads"  on public.diagnosis_uploads  for all using (true) with check (true);
