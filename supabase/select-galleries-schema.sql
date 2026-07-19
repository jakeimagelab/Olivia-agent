-- 셀렉 갤러리 (app/api/select-galleries/**, app/api/select/[shareToken], 메일링 "사진 셀렉 링크")
-- 이 기능이 쓰는 4개 테이블에 대한 마이그레이션 파일이 레포에 없었던 것으로 확인되어 새로 작성.
-- 일부 테이블이 이미 부분적으로 존재할 수 있어 photo-galleries-schema.sql과 동일하게
-- create table은 뼈대만 만들고 나머지는 전부 add column if not exists로 채운다.

create table if not exists public.select_galleries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.select_galleries add column if not exists client_id              uuid references public.clients(id) on delete set null;
alter table public.select_galleries add column if not exists workflow_run_id        uuid references public.workflow_runs(id) on delete set null;
alter table public.select_galleries add column if not exists title                  text not null default '';
alter table public.select_galleries add column if not exists hospital_name          text default '';
alter table public.select_galleries add column if not exists shooting_name          text default '';
alter table public.select_galleries add column if not exists shooting_date          date;
alter table public.select_galleries add column if not exists share_token            text;
alter table public.select_galleries add column if not exists status                 text not null default 'draft';
alter table public.select_galleries add column if not exists allow_web_select       boolean not null default true;
alter table public.select_galleries add column if not exists allow_download_upload  boolean not null default true;
alter table public.select_galleries add column if not exists allow_download_zip     boolean not null default true;
alter table public.select_galleries add column if not exists allow_resubmit         boolean not null default false;
alter table public.select_galleries add column if not exists total_jpg_count        integer not null default 0;
alter table public.select_galleries add column if not exists selected_count         integer not null default 0;
alter table public.select_galleries add column if not exists file_expires_at        timestamptz;
alter table public.select_galleries add column if not exists submitted_at           timestamptz;
alter table public.select_galleries add column if not exists updated_at             timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'select_galleries_status_check') then
    alter table public.select_galleries add constraint select_galleries_status_check
      check (status in ('draft','uploading_images','ready','mail_draft_created','mail_sent',
                         'waiting_selection','selection_submitted','raw_matching','raw_matched',
                         'retouching','completed','files_expired','expired'));
  end if;
end $$;

create unique index if not exists select_galleries_share_token_idx on public.select_galleries(share_token) where share_token is not null;
create index if not exists select_galleries_client_id_idx on public.select_galleries(client_id);
create index if not exists select_galleries_workflow_run_id_idx on public.select_galleries(workflow_run_id);

create table if not exists public.select_gallery_images (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.select_gallery_images add column if not exists gallery_id          uuid references public.select_galleries(id) on delete cascade;
alter table public.select_gallery_images add column if not exists original_file_name  text default '';
alter table public.select_gallery_images add column if not exists basename            text default '';
alter table public.select_gallery_images add column if not exists extension           text default '';
alter table public.select_gallery_images add column if not exists scene_id            text;
alter table public.select_gallery_images add column if not exists scene_name          text;
alter table public.select_gallery_images add column if not exists folder_name         text;
alter table public.select_gallery_images add column if not exists image_url           text;
alter table public.select_gallery_images add column if not exists thumbnail_url       text;
alter table public.select_gallery_images add column if not exists preview_url         text;
alter table public.select_gallery_images add column if not exists width               integer;
alter table public.select_gallery_images add column if not exists height              integer;
alter table public.select_gallery_images add column if not exists file_size           integer;
alter table public.select_gallery_images add column if not exists expires_at          timestamptz;
alter table public.select_gallery_images add column if not exists sort_order          integer not null default 0;

create index if not exists select_gallery_images_gallery_id_idx on public.select_gallery_images(gallery_id);

create table if not exists public.client_photo_selections (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.client_photo_selections add column if not exists client_id       uuid references public.clients(id) on delete set null;
alter table public.client_photo_selections add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null;
alter table public.client_photo_selections add column if not exists gallery_id      uuid references public.select_galleries(id) on delete cascade;
alter table public.client_photo_selections add column if not exists method          text not null default 'web_select';
alter table public.client_photo_selections add column if not exists selected_files  jsonb not null default '[]'::jsonb;
alter table public.client_photo_selections add column if not exists selected_count  integer not null default 0;
alter table public.client_photo_selections add column if not exists customer_memo   text;
alter table public.client_photo_selections add column if not exists submitted_at    timestamptz not null default now();
alter table public.client_photo_selections add column if not exists updated_at      timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_photo_selections_method_check') then
    alter table public.client_photo_selections add constraint client_photo_selections_method_check
      check (method in ('web_select','download_upload'));
  end if;
end $$;

create index if not exists client_photo_selections_gallery_id_idx on public.client_photo_selections(gallery_id);

create table if not exists public.select_raw_matches (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.select_raw_matches add column if not exists client_id         uuid references public.clients(id) on delete set null;
alter table public.select_raw_matches add column if not exists workflow_run_id   uuid references public.workflow_runs(id) on delete set null;
alter table public.select_raw_matches add column if not exists gallery_id        uuid references public.select_galleries(id) on delete cascade;
alter table public.select_raw_matches add column if not exists selection_id      uuid references public.client_photo_selections(id) on delete cascade;
alter table public.select_raw_matches add column if not exists selected_jpg      text default '';
alter table public.select_raw_matches add column if not exists selected_basename text default '';
alter table public.select_raw_matches add column if not exists matched_raw       text;
alter table public.select_raw_matches add column if not exists raw_extension     text;
alter table public.select_raw_matches add column if not exists status            text not null default 'raw_missing';
alter table public.select_raw_matches add column if not exists note              text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'select_raw_matches_status_check') then
    alter table public.select_raw_matches add constraint select_raw_matches_status_check
      check (status in ('matched','raw_missing','duplicate_raw','jpg_missing'));
  end if;
end $$;

create index if not exists select_raw_matches_gallery_id_idx on public.select_raw_matches(gallery_id);
create index if not exists select_raw_matches_selection_id_idx on public.select_raw_matches(selection_id);

-- RLS 활성화 + 서버 service role 접근 허용 (mailing_queue 등 기존 테이블과 동일한 패턴)
alter table public.select_galleries         enable row level security;
alter table public.select_gallery_images    enable row level security;
alter table public.client_photo_selections  enable row level security;
alter table public.select_raw_matches       enable row level security;

drop policy if exists "service role full access select_galleries" on public.select_galleries;
create policy "service role full access select_galleries" on public.select_galleries for all using (true) with check (true);

drop policy if exists "service role full access select_gallery_images" on public.select_gallery_images;
create policy "service role full access select_gallery_images" on public.select_gallery_images for all using (true) with check (true);

drop policy if exists "service role full access client_photo_selections" on public.client_photo_selections;
create policy "service role full access client_photo_selections" on public.client_photo_selections for all using (true) with check (true);

drop policy if exists "service role full access select_raw_matches" on public.select_raw_matches;
create policy "service role full access select_raw_matches" on public.select_raw_matches for all using (true) with check (true);

notify pgrst, 'reload schema';
