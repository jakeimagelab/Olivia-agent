-- 라이브러리(레퍼런스 지식창고) 기능
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.library_items (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('quote','business_english','marketing_case','consulting_framework','world_issue')),
  title        text not null,
  content      jsonb not null default '{}',
  tags         text[] default '{}',
  source       text,
  is_favorite  boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists library_items_category_idx on public.library_items(category);
create index if not exists library_items_tags_idx on public.library_items using gin(tags);

notify pgrst, 'reload schema';
