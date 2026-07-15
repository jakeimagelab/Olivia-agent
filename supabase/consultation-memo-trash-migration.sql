-- Olivia 상담 메모 확장 + 공통 휴지통

alter table public.consultation_memos
  add column if not exists title text not null default '',
  add column if not exists template_type text not null default 'text',
  add column if not exists template_data jsonb not null default '{}'::jsonb,
  add column if not exists canvas_path text,
  add column if not exists ai_image_path text,
  add column if not exists audio_path text,
  add column if not exists audio_duration_seconds integer not null default 0,
  add column if not exists transcript text not null default '',
  add column if not exists audio_summary text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table public.consultation_memos
  drop constraint if exists consultation_memos_template_type_check;

alter table public.consultation_memos
  add constraint consultation_memos_template_type_check
  check (template_type in ('text', 'cornell', 'todo', 'blank', 'grid', 'conti'));

create index if not exists consultation_memos_created_at_idx
  on public.consultation_memos (created_at desc);

create index if not exists consultation_memos_hospital_id_idx
  on public.consultation_memos (hospital_id)
  where hospital_id is not null;

drop trigger if exists consultation_memos_updated_at on public.consultation_memos;
create trigger consultation_memos_updated_at
  before update on public.consultation_memos
  for each row execute procedure public.set_updated_at();

create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_label text not null,
  source_table text not null,
  source_id text,
  title text not null default '',
  preview text not null default '',
  payload jsonb not null default '{}'::jsonb,
  asset_paths jsonb not null default '[]'::jsonb,
  deleted_by text not null default 'system-user',
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists trash_items_deleted_at_idx
  on public.trash_items (deleted_at desc);

create index if not exists trash_items_expires_at_idx
  on public.trash_items (expires_at);

create index if not exists trash_items_source_type_idx
  on public.trash_items (source_type, deleted_at desc);

alter table public.trash_items enable row level security;

drop policy if exists "service role trash_items" on public.trash_items;
create policy "service role trash_items"
  on public.trash_items for all to service_role using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'consultation-assets',
  'consultation-assets',
  false,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
