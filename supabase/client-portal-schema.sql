-- ── Client Portal 스키마 ────────────────────────────────────

-- 1. 고객 포털 접근 토큰
create table if not exists public.client_portal_access (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  email             text default '',
  access_token      text not null unique,
  token_expires_at  timestamptz,
  is_active         boolean not null default true,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2. 고객 포털 이벤트 로그
create table if not exists public.client_portal_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  event_type  text not null,
  target_type text default '',
  target_id   text default '',
  memo        text default '',
  created_at  timestamptz not null default now()
);

-- 3. 수정 요청
create table if not exists public.client_revision_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  request_type  text not null default 'general',
  title         text not null default '',
  content       text not null default '',
  related_file  text default '',
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status        text not null default 'requested' check (status in ('requested','in_progress','completed','rejected')),
  admin_reply   text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4. 고객 리뷰
create table if not exists public.client_reviews (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients(id) on delete cascade,
  overall_rating       int not null default 5 check (overall_rating between 1 and 5),
  shooting_rating      int default 5 check (shooting_rating between 1 and 5),
  result_rating        int default 5 check (result_rating between 1 and 5),
  good_points          text default '',
  improvement_points   text default '',
  public_review_text   text default '',
  allow_public_use     boolean default false,
  allow_hospital_name  boolean default true,
  writer_name          text default '',
  created_at           timestamptz not null default now()
);

-- updated_at 트리거
drop trigger if exists client_portal_access_updated_at on public.client_portal_access;
create trigger client_portal_access_updated_at
  before update on public.client_portal_access
  for each row execute procedure public.set_updated_at();

drop trigger if exists client_revision_requests_updated_at on public.client_revision_requests;
create trigger client_revision_requests_updated_at
  before update on public.client_revision_requests
  for each row execute procedure public.set_updated_at();

-- 인덱스
create index if not exists idx_cpa_token    on public.client_portal_access(access_token);
create index if not exists idx_cpa_client   on public.client_portal_access(client_id);
create index if not exists idx_cpe_client   on public.client_portal_events(client_id);
create index if not exists idx_cpe_type     on public.client_portal_events(event_type);
create index if not exists idx_crr_client   on public.client_revision_requests(client_id);
create index if not exists idx_cr_client    on public.client_reviews(client_id);

-- RLS (service role 전용)
alter table public.client_portal_access      enable row level security;
alter table public.client_portal_events      enable row level security;
alter table public.client_revision_requests  enable row level security;
alter table public.client_reviews            enable row level security;

create policy "service role client_portal_access"
  on public.client_portal_access for all using (true) with check (true);
create policy "service role client_portal_events"
  on public.client_portal_events for all using (true) with check (true);
create policy "service role client_revision_requests"
  on public.client_revision_requests for all using (true) with check (true);
create policy "service role client_reviews"
  on public.client_reviews for all using (true) with check (true);

-- mailing_queue 타입 확장 (portal 관련 타입 추가)
-- 기존 constraint를 drop하고 재생성
alter table public.mailing_queue
  drop constraint if exists mailing_queue_type_check;

alter table public.mailing_queue
  add constraint mailing_queue_type_check check (type in (
    'quote','contract','conti','proposal','original_files','gallery',
    'review_form','monthly_report',
    'per_report','per_order','per_donation',
    'portal_notification'
  ));
