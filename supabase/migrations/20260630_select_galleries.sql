-- ================================================
-- 고객 셀렉 & RAW 매칭 시스템
-- ================================================

create table if not exists select_galleries (
  id                  text primary key default gen_random_uuid()::text,
  client_id           text,
  workflow_run_id     text,
  title               text not null,
  hospital_name       text,
  shooting_name       text,
  shooting_date       date,
  share_token         text unique not null,
  status              text not null default 'draft',
  allow_web_select    boolean not null default true,
  allow_download_upload boolean not null default true,
  allow_download_zip  boolean not null default true,
  allow_resubmit      boolean not null default false,
  total_jpg_count     int not null default 0,
  selected_count      int not null default 0,
  file_expires_at     timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  submitted_at        timestamptz
);

create table if not exists select_gallery_images (
  id                  text primary key default gen_random_uuid()::text,
  gallery_id          text not null references select_galleries(id) on delete cascade,
  original_file_name  text not null,
  basename            text not null,
  extension           text not null,
  scene_id            text,
  scene_name          text,
  folder_name         text,
  image_url           text not null,
  thumbnail_url       text,
  preview_url         text,
  width               int,
  height              int,
  file_size           bigint,
  expires_at          timestamptz not null,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists idx_gallery_images_gallery_id on select_gallery_images(gallery_id);

create table if not exists client_photo_selections (
  id                  text primary key default gen_random_uuid()::text,
  client_id           text,
  workflow_run_id     text,
  gallery_id          text not null references select_galleries(id) on delete cascade,
  method              text not null check (method in ('web_select','download_upload')),
  selected_files      text[] not null default '{}',
  selected_count      int not null default 0,
  customer_memo       text,
  submitted_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_selections_gallery_id on client_photo_selections(gallery_id);

create table if not exists select_raw_matches (
  id                  text primary key default gen_random_uuid()::text,
  client_id           text,
  workflow_run_id     text,
  gallery_id          text not null references select_galleries(id) on delete cascade,
  selection_id        text not null references client_photo_selections(id) on delete cascade,
  selected_jpg        text not null,
  selected_basename   text not null,
  matched_raw         text,
  raw_extension       text,
  status              text not null check (status in ('matched','raw_missing','duplicate_raw','jpg_missing')),
  note                text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_raw_matches_gallery_id on select_raw_matches(gallery_id);

-- Supabase Storage bucket (run manually in dashboard or via API)
-- insert into storage.buckets (id, name, public) values ('select-galleries', 'select-galleries', true) on conflict do nothing;
