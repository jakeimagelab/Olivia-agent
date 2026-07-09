-- ── 병원 트렌드 분석 대시보드 ────────────────────────────────
-- 업종 값: '피부과' | '성형외과' | '한의원' | '정형외과' | '기타'

-- 키워드 검색량 트렌드 (네이버 데이터랩 / 구글 트렌드)
create table if not exists public.trend_keywords (
  id           uuid primary key default gen_random_uuid(),
  keyword      text not null,
  industry     text not null default '기타',
  source       text not null check (source in ('naver', 'google')),
  period       text not null default 'week' check (period in ('day', 'week', 'month')),
  date         date not null,
  value        numeric not null default 0,
  raw          jsonb default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_trend_keywords_lookup on public.trend_keywords (industry, source, date);
create unique index if not exists uq_trend_keywords on public.trend_keywords (keyword, source, period, date);

-- SNS 게시물 트렌드 (인스타그램 / 유튜브)
create table if not exists public.trend_sns_posts (
  id                 uuid primary key default gen_random_uuid(),
  platform           text not null check (platform in ('instagram', 'youtube')),
  hospital_name      text default '',
  industry           text not null default '기타',
  post_type          text default '',
  external_id        text default '',
  url                text default '',
  caption            text default '',
  hashtags           text[] default '{}',
  likes              int default 0,
  comments           int default 0,
  views              int default 0,
  followers_snapshot int default 0,
  posted_at          timestamptz,
  collected_at       timestamptz not null default now(),
  raw                jsonb default '{}'::jsonb
);
create index if not exists idx_trend_sns_posts_lookup on public.trend_sns_posts (industry, platform, collected_at);

-- 경쟁 병원 마스터
create table if not exists public.trend_competitors (
  id                 uuid primary key default gen_random_uuid(),
  hospital_name      text not null,
  industry           text not null default '기타',
  instagram_handle   text default '',
  youtube_channel_id text default '',
  homepage_url       text default '',
  is_active          boolean default true,
  created_at         timestamptz not null default now()
);

-- 경쟁 병원 SNS 스냅샷 (성장률 비교용)
create table if not exists public.trend_competitor_snapshots (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid references public.trend_competitors(id) on delete cascade,
  platform       text not null check (platform in ('instagram', 'youtube')),
  followers      int default 0,
  posts_count    int default 0,
  avg_engagement numeric default 0,
  snapshot_date  date not null,
  raw            jsonb default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_trend_competitor_snapshots_lookup on public.trend_competitor_snapshots (competitor_id, snapshot_date);
create unique index if not exists uq_trend_competitor_snapshots on public.trend_competitor_snapshots (competitor_id, platform, snapshot_date);

-- AI 인사이트 코멘트 (Claude 생성)
create table if not exists public.trend_insights (
  id           uuid primary key default gen_random_uuid(),
  industry     text not null default '전체',
  period_start date not null,
  period_end   date not null,
  summary      text not null default '',
  highlights   jsonb default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_trend_insights_lookup on public.trend_insights (industry, created_at desc);

-- 수집 실행 로그 (Cron / 수동 실행 관측용)
create table if not exists public.trend_collection_runs (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('naver', 'youtube', 'google_trends', 'instagram', 'insight')),
  status          text not null default 'running' check (status in ('running', 'success', 'error', 'skipped')),
  items_collected int default 0,
  error_message   text default '',
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index if not exists idx_trend_collection_runs_lookup on public.trend_collection_runs (source, started_at desc);
