-- ══════════════════════════════════════════════════════════════
--  PER (Photoclinic ESG Reward) 스키마
--  슬로건: 좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.
-- ══════════════════════════════════════════════════════════════

-- ── 0. clients 테이블 PER 필드 추가 ────────────────────────────
alter table public.clients
  add column if not exists reward_tier        text default 'standard' check (reward_tier in ('standard','silver','gold','vip')),
  add column if not exists total_paid_amount  bigint default 0,
  add column if not exists total_earned_points bigint default 0,
  add column if not exists total_used_points  bigint default 0,
  add column if not exists total_donated_points bigint default 0,
  add column if not exists available_points   bigint default 0,
  add column if not exists per_joined         boolean default false,
  add column if not exists per_joined_at      timestamptz;

-- ── 1. PER 설정 테이블 ─────────────────────────────────────────
create table if not exists public.per_settings (
  id                      uuid primary key default gen_random_uuid(),
  reward_rate             numeric(5,4) not null default 0.01,
  point_value             integer not null default 1,
  point_expiration_months integer not null default 24,
  allow_donation          boolean not null default true,
  allow_product_order     boolean not null default true,
  min_points_to_use       integer not null default 1000,
  policy_note             text default '',
  updated_at              timestamptz not null default now()
);

insert into public.per_settings (id, reward_rate, point_value, point_expiration_months)
values (gen_random_uuid(), 0.01, 1, 24)
on conflict do nothing;

-- ── 2. 포인트 거래 내역 ────────────────────────────────────────
create table if not exists public.reward_transactions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  type         text not null check (type in ('earn','use','donate','adjust','expire','cancel')),
  amount       bigint default 0,
  points       bigint not null,
  balance_after bigint not null default 0,
  source_type  text default '' check (source_type in ('','quote','contract','project','order','donation','manual')),
  source_id    text default '',
  memo         text default '',
  created_by   text default 'admin',
  created_at   timestamptz not null default now()
);

create index if not exists idx_reward_transactions_client on public.reward_transactions(client_id);
create index if not exists idx_reward_transactions_type   on public.reward_transactions(type);

-- ── 3. 리워드 제품 카탈로그 ────────────────────────────────────
create table if not exists public.reward_products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text not null default '기타'
                   check (category in ('의료진 이미지','병원 공간 소품','향기/공간 경험','고객 응대','VIP 선물','촬영 준비 제품','포토클리닉 굿즈','별도 문의 상품')),
  description      text default '',
  price            integer not null default 0,
  required_points  integer not null default 0,
  image_url        text default '',
  stock            integer default 999,
  supplier         text default '',
  shipping_fee     integer default 0,
  status           text not null default 'active'
                   check (status in ('active','hidden','sold_out','inquiry_only')),
  is_featured      boolean default false,
  admin_memo       text default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 샘플 제품 데이터
insert into public.reward_products (name, category, description, price, required_points, status, is_featured) values
  ('스크럽복 (기본형)', '의료진 이미지', '포토클리닉 촬영용 의료진 스크럽복. 깔끔한 디자인으로 브랜딩 이미지에 최적화.', 45000, 4500, 'active', true),
  ('프리미엄 디퓨저', '향기/공간 경험', '병원 대기실과 로비를 위한 고급 디퓨저. 은은하고 전문적인 향기로 공간 경험을 높여드립니다.', 68000, 6800, 'active', true),
  ('네스프레소 버츄오 플러스', '고객 응대', '병원 대기실 고객 응대용 네스프레소 커피머신. 고급스러운 커피 경험을 제공합니다.', 189000, 18900, 'active', true),
  ('네스프레소 캡슐 (10개입)', '고객 응대', '네스프레소 호환 캡슐 10개입. 다양한 원두 선택 가능.', 18000, 1800, 'active', false),
  ('병원 공간 인테리어 소품 세트', '병원 공간 소품', '포토클리닉이 선별한 병원 로비/진료실용 인테리어 소품 세트. 화병, 오브제, 트레이 포함.', 120000, 12000, 'active', true),
  ('프리미엄 가운', '의료진 이미지', '의사/원장 촬영용 고급 가운. 카메라에 잘 담히는 소재와 디자인.', 89000, 8900, 'active', false),
  ('고급 와인', 'VIP 선물', '포토클리닉 VIP 고객 감사 선물용 프리미엄 와인. 주류는 관리자 승인 후 별도 배송 안내.', 120000, 12000, 'inquiry_only', false),
  ('포토클리닉 리포트북', '포토클리닉 굿즈', '병원 브랜딩 사진 결과물 리포트북. 촬영 스토리와 브랜딩 방향을 담은 고급 제본.', 55000, 5500, 'active', false)
on conflict do nothing;

-- ── 4. 제품 신청 (주문) ────────────────────────────────────────
create table if not exists public.reward_orders (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients(id) on delete cascade,
  product_id           uuid not null references public.reward_products(id) on delete restrict,
  quantity             integer not null default 1,
  used_points          integer not null default 0,
  extra_payment_amount integer default 0,
  shipping_name        text default '',
  shipping_phone       text default '',
  shipping_address     text default '',
  request_note         text default '',
  status               text not null default 'pending'
                       check (status in ('pending','approved','points_deducted','preparing','shipped','completed','canceled','rejected')),
  admin_memo           text default '',
  transaction_id       uuid references public.reward_transactions(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_reward_orders_client on public.reward_orders(client_id);
create index if not exists idx_reward_orders_status on public.reward_orders(status);

-- ── 5. 기부 캠페인 ─────────────────────────────────────────────
create table if not exists public.donation_campaigns (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  period_label      text default '',
  start_date        date,
  end_date          date,
  donation_target   text default '',
  description       text default '',
  goal_amount       bigint default 0,
  current_points    bigint default 0,
  current_amount    bigint default 0,
  participant_count integer default 0,
  status            text not null default 'draft'
                    check (status in ('draft','active','closed','donated','reported')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 6. 기부 기록 ───────────────────────────────────────────────
create table if not exists public.donation_records (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid references public.donation_campaigns(id) on delete set null,
  client_id            uuid not null references public.clients(id) on delete cascade,
  points               integer not null default 0,
  amount               integer default 0,
  hospital_name_public boolean default true,
  display_name         text default '',
  status               text not null default 'pending'
                       check (status in ('pending','confirmed','canceled')),
  transaction_id       uuid references public.reward_transactions(id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_donation_records_campaign on public.donation_records(campaign_id);
create index if not exists idx_donation_records_client   on public.donation_records(client_id);

-- ── 7. PER 리포트 ──────────────────────────────────────────────
create table if not exists public.per_reports (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.clients(id) on delete set null,
  campaign_id      uuid references public.donation_campaigns(id) on delete set null,
  report_type      text not null check (report_type in ('client','campaign','overall')),
  title            text not null default '',
  summary          text default '',
  report_data      jsonb default '{}'::jsonb,
  html_content     text default '',
  mailing_queue_id uuid,
  created_at       timestamptz not null default now()
);

-- ── 8. mailing_queue type 확장 ─────────────────────────────────
-- 기존 체크 제약을 삭제하고 per 타입 포함한 새 제약 추가
alter table public.mailing_queue
  drop constraint if exists mailing_queue_type_check;

alter table public.mailing_queue
  add constraint mailing_queue_type_check
  check (type in (
    'quote','contract','conti','proposal','original_files',
    'gallery','review_form','monthly_report',
    'per_report','per_order','per_donation'
  ));

-- ── 9. updated_at 트리거 적용 ──────────────────────────────────
drop trigger if exists reward_products_updated_at on public.reward_products;
create trigger reward_products_updated_at
  before update on public.reward_products
  for each row execute procedure public.set_updated_at();

drop trigger if exists reward_orders_updated_at on public.reward_orders;
create trigger reward_orders_updated_at
  before update on public.reward_orders
  for each row execute procedure public.set_updated_at();

drop trigger if exists donation_campaigns_updated_at on public.donation_campaigns;
create trigger donation_campaigns_updated_at
  before update on public.donation_campaigns
  for each row execute procedure public.set_updated_at();

-- ── 10. RLS ────────────────────────────────────────────────────
alter table public.per_settings        enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.reward_products     enable row level security;
alter table public.reward_orders       enable row level security;
alter table public.donation_campaigns  enable row level security;
alter table public.donation_records    enable row level security;
alter table public.per_reports         enable row level security;

create policy "service role per_settings"        on public.per_settings        for all using (true) with check (true);
create policy "service role reward_transactions" on public.reward_transactions for all using (true) with check (true);
create policy "service role reward_products"     on public.reward_products     for all using (true) with check (true);
create policy "service role reward_orders"       on public.reward_orders       for all using (true) with check (true);
create policy "service role donation_campaigns"  on public.donation_campaigns  for all using (true) with check (true);
create policy "service role donation_records"    on public.donation_records    for all using (true) with check (true);
create policy "service role per_reports"         on public.per_reports         for all using (true) with check (true);

-- ══════════════════════════════════════════════════════════════
--  ⚠️  운영 전 세무/법무 검토 필요
--  - 포인트는 병원 계정 단위로 적립됩니다. 현금 환급 불가.
--  - 기부 내역은 투명하게 기록됩니다.
--  - 고급 와인 등 주류는 관리자 승인 후 별도 배송 안내.
-- ══════════════════════════════════════════════════════════════
