create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_name text default '',
  phone text default '',
  email text default '',
  website_url text default '',
  instagram_url text default '',
  blog_url text default '',
  naver_place_url text default '',
  youtube_url text default '',
  kakao_url text default '',
  memo text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  plan_name text not null default '월간 포토클리닉',
  monthly_price integer not null default 500000,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  start_date date,
  end_date date,
  monthly_quota_images integer not null default 8,
  monthly_quota_captions integer not null default 8,
  monthly_quota_blog_posts integer not null default 2,
  monthly_quota_reports integer not null default 1,
  memo text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  file_url text not null,
  file_type text not null default 'photo',
  category text not null,
  title text not null,
  description text default '',
  usable_instagram boolean not null default true,
  usable_blog boolean not null default true,
  usable_place boolean not null default true,
  usable_homepage boolean not null default true,
  usable_ad boolean not null default false,
  model_release_status text default 'unchecked',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.content_calendar (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  month text not null,
  scheduled_date date,
  channel text not null,
  content_type text not null,
  title text not null,
  status text not null default '기획중',
  asset_id uuid references public.content_assets(id) on delete set null,
  memo text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  calendar_id uuid references public.content_calendar(id) on delete set null,
  asset_id uuid references public.content_assets(id) on delete set null,
  channel text not null,
  content_type text not null,
  title text default '',
  body text default '',
  caption text default '',
  hashtags text default '',
  design_url text default '',
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.channel_audits (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals(id) on delete set null,
  website_score integer,
  instagram_score integer,
  blog_score integer,
  place_score integer,
  youtube_score integer,
  summary text default '',
  strengths text default '',
  weaknesses text default '',
  recommendations text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  report_month text not null,
  summary text default '',
  completed_count integer not null default 0,
  pending_count integer not null default 0,
  recommendations text default '',
  email_body text default '',
  pdf_url text default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_hospital_id_idx on public.subscriptions(hospital_id);
create index if not exists content_assets_hospital_id_idx on public.content_assets(hospital_id);
create index if not exists content_calendar_month_idx on public.content_calendar(month, hospital_id);
create index if not exists monthly_reports_month_idx on public.monthly_reports(report_month, hospital_id);
