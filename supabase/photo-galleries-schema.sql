-- 사진 갤러리 (app/gallery, app/api/galleries, Olivia get_gallery/create_gallery 도구)
-- "Could not find the table 'public.photo_galleries' in the schema cache" 오류 해결용 마이그레이션.
create table if not exists public.photo_galleries (
  id              uuid primary key default gen_random_uuid(),
  hospital_name   text not null,
  contact_name    text default '',
  contact_email   text default '',
  shoot_date      date,
  nas_link        text not null,
  description     text default '',
  client_id       uuid references public.clients(id) on delete set null,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.photo_gallery_items (
  id             uuid primary key default gen_random_uuid(),
  gallery_id     uuid not null references public.photo_galleries(id) on delete cascade,
  title          text default '',
  thumbnail_url  text default '',
  nas_file_url   text default '',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

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
