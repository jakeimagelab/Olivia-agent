-- 포토클리닉 블로그 패턴 라이터 스키마
-- Run in Supabase SQL Editor

-- 1. 소스 블로그 글 (패턴 학습용)
create table if not exists blog_source_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text,
  body text not null,
  category text not null default '병원 촬영 사례형',
  is_hospital_related boolean default true,
  analysis_result jsonb,
  style_profile_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. 스타일 프로필
create table if not exists blog_style_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  source_count integer default 0,
  title_patterns text,
  opening_patterns text,
  body_structure text,
  common_phrases jsonb default '[]',
  photoclinic_messages jsonb default '[]',
  cta_patterns text,
  tone text,
  keywords jsonb default '[]',
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. 생성된 블로그 글
create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid,
  style_profile_id uuid references blog_style_profiles(id),
  post_type text not null default '병원 촬영 사례형',
  title text not null,
  body text not null,
  summary text,
  image_captions jsonb default '[]',
  instagram_summary text,
  naver_place_version text,
  hashtags jsonb default '[]',
  seo_keywords jsonb default '[]',
  meta_description text,
  cta text,
  risk_check_result jsonb,
  status text not null default 'draft', -- draft | published | archived
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS 비활성화 (서비스 롤 사용)
alter table blog_source_posts disable row level security;
alter table blog_style_profiles disable row level security;
alter table blog_posts disable row level security;

-- updated_at 자동 업데이트 트리거
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger blog_source_posts_updated_at before update on blog_source_posts for each row execute function update_updated_at();
create trigger blog_style_profiles_updated_at before update on blog_style_profiles for each row execute function update_updated_at();
create trigger blog_posts_updated_at before update on blog_posts for each row execute function update_updated_at();
