-- ══════════════════════════════════════════════════════════════
-- 올리비아 AI 비서 — 전체 테이블 셋업 (Supabase SQL Editor에서 실행)
-- ══════════════════════════════════════════════════════════════

-- ── 0. updated_at 자동 갱신 함수 ─────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── 1. 통합 메일링 큐 ────────────────────────────────────────
create table if not exists public.mailing_queue (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('quote','contract','conti','proposal','original_files','gallery','review_form','monthly_report')),
  source_module  text not null default '',
  source_id      text default '',
  hospital_name  text not null default '',
  contact_name   text default '',
  to_email       text default '',
  subject        text not null default '',
  body           text not null default '',
  attachments    jsonb not null default '[]'::jsonb,
  links          jsonb not null default '[]'::jsonb,
  status         text not null default 'draft' check (status in ('draft','ready','sent','failed')),
  error_message  text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  sent_at        timestamptz
);

create table if not exists public.mailing_logs (
  id            uuid primary key default gen_random_uuid(),
  queue_id      uuid references public.mailing_queue(id) on delete set null,
  type          text not null default '',
  hospital_name text not null default '',
  to_email      text not null default '',
  subject       text not null default '',
  status        text not null default 'sent' check (status in ('sent','failed')),
  error         text default '',
  sent_at       timestamptz not null default now()
);

drop trigger if exists mailing_queue_updated_at on public.mailing_queue;
create trigger mailing_queue_updated_at
  before update on public.mailing_queue
  for each row execute procedure public.set_updated_at();

alter table public.mailing_queue enable row level security;
alter table public.mailing_logs  enable row level security;

drop policy if exists "service role full access mailing_queue" on public.mailing_queue;
drop policy if exists "service role full access mailing_logs"  on public.mailing_logs;

create policy "service role full access mailing_queue"
  on public.mailing_queue for all to service_role using (true) with check (true);
create policy "service role full access mailing_logs"
  on public.mailing_logs  for all to service_role using (true) with check (true);

-- ── 2. 고객(병원) 관리 ───────────────────────────────────────
create table if not exists public.clients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  manager_name        text default '',
  phone               text default '',
  email               text default '',
  department          text default '',
  website_url         text default '',
  instagram_url       text default '',
  blog_url            text default '',
  naver_place_url     text default '',
  memo                text default '',
  subscription_status text default 'none' check (subscription_status in ('none','active','paused','cancelled')),
  workflow_status     text default '상담완료',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

alter table public.clients enable row level security;

drop policy if exists "service role clients" on public.clients;
create policy "service role clients"
  on public.clients for all to service_role using (true) with check (true);

-- ── 3. 상담 메모 ─────────────────────────────────────────────
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

alter table public.consultation_memos enable row level security;

drop policy if exists "service role consultation_memos" on public.consultation_memos;
create policy "service role consultation_memos"
  on public.consultation_memos for all to service_role using (true) with check (true);

-- ── 4. 진단 이미지 업로드 ────────────────────────────────────
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

alter table public.diagnosis_uploads enable row level security;

drop policy if exists "service role diagnosis_uploads" on public.diagnosis_uploads;
create policy "service role diagnosis_uploads"
  on public.diagnosis_uploads for all to service_role using (true) with check (true);

-- ── 6. 콘티 저장 (다중 기기 공유) ──────────────────────────
create table if not exists public.conti_saves (
  id            uuid primary key default gen_random_uuid(),
  hospital_name text not null default '',
  specialties   text[] not null default '{}',
  title         text not null default '',
  result        jsonb not null,
  saved_at      timestamptz not null default now()
);

alter table public.conti_saves enable row level security;

drop policy if exists "service role full access conti_saves" on public.conti_saves;
create policy "service role full access conti_saves"
  on public.conti_saves for all to service_role using (true) with check (true);

-- ── 7. 콘티 현장뷰 공유 ─────────────────────────────────────
create table if not exists public.conti_shares (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null,
  title       text not null default '',
  hospital    text not null default '',
  specialties text default '',
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.conti_shares enable row level security;

drop policy if exists "service role full access conti_shares" on public.conti_shares;
create policy "service role full access conti_shares"
  on public.conti_shares for all to service_role using (true) with check (true);

-- ── 8. 데일리 아이디어 ──────────────────────────────────────
create table if not exists public.daily_ideas (
  id               uuid primary key default gen_random_uuid(),
  date             text unique not null,
  marketing_idea   jsonb not null default '{}'::jsonb,
  content_ideas    jsonb not null default '[]'::jsonb,
  customer_tip     jsonb not null default '{}'::jsonb,
  mission          jsonb not null default '{}'::jsonb,
  trend_keywords   text[] not null default '{}',
  created_at       timestamptz not null default now()
);

alter table public.daily_ideas enable row level security;

drop policy if exists "service role full access daily_ideas" on public.daily_ideas;
create policy "service role full access daily_ideas"
  on public.daily_ideas for all to service_role using (true) with check (true);

-- ══════════════════════════════════════════════════════════════
-- 완료! 위 SQL을 Supabase → SQL Editor → New Query에 붙여넣고 Run 하세요.
-- ══════════════════════════════════════════════════════════════
