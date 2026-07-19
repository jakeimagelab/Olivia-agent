-- 사진 갤러리 (app/gallery, app/api/galleries, Olivia get_gallery/create_gallery 도구)
-- "Could not find the table/column ... in the schema cache" 오류 해결용 마이그레이션.
-- 테이블이 이미 일부 컬럼만 있는 상태로 존재할 수 있어(client_id 등 누락), create table은 뼈대만
-- 만들고 나머지는 전부 add column if not exists로 채워 넣는다 — 몇 번을 실행해도 안전하다.
create table if not exists public.photo_galleries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.photo_galleries add column if not exists hospital_name   text default '';
alter table public.photo_galleries add column if not exists contact_name    text default '';
alter table public.photo_galleries add column if not exists contact_email   text default '';
alter table public.photo_galleries add column if not exists shoot_date      date;
alter table public.photo_galleries add column if not exists nas_link        text default '';
alter table public.photo_galleries add column if not exists description     text default '';
alter table public.photo_galleries add column if not exists client_id       uuid references public.clients(id) on delete set null;
alter table public.photo_galleries add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;

create table if not exists public.photo_gallery_items (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.photo_gallery_items add column if not exists gallery_id    uuid references public.photo_galleries(id) on delete cascade;
alter table public.photo_gallery_items add column if not exists title         text default '';
alter table public.photo_gallery_items add column if not exists thumbnail_url text default '';
alter table public.photo_gallery_items add column if not exists nas_file_url  text default '';
alter table public.photo_gallery_items add column if not exists sort_order    integer not null default 0;

create index if not exists photo_galleries_client_id_idx on public.photo_galleries(client_id);
create index if not exists photo_galleries_workflow_run_id_idx on public.photo_galleries(workflow_run_id);
create index if not exists photo_gallery_items_gallery_id_idx on public.photo_gallery_items(gallery_id);

-- RLS 활성화 + 서버 service role 접근 허용 (mailing_queue 등 기존 테이블과 동일한 패턴)
alter table public.photo_galleries enable row level security;
alter table public.photo_gallery_items enable row level security;

drop policy if exists "service role full access photo_galleries" on public.photo_galleries;
create policy "service role full access photo_galleries"
  on public.photo_galleries for all
  using (true) with check (true);

drop policy if exists "service role full access photo_gallery_items" on public.photo_gallery_items;
create policy "service role full access photo_gallery_items"
  on public.photo_gallery_items for all
  using (true) with check (true);
