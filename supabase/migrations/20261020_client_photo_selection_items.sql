create table if not exists public.client_photo_selection_items (
  id uuid primary key default gen_random_uuid(),
  selection_id text not null references public.client_photo_selections(id) on delete cascade,
  gallery_id text references public.select_galleries(id) on delete cascade,
  image_id text references public.select_gallery_images(id) on delete set null,
  file_name text not null default '',
  category text not null default '',
  memo text not null default '',
  retouch_keys jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_photo_selection_items_selection_idx
  on public.client_photo_selection_items (selection_id);
create index if not exists client_photo_selection_items_gallery_idx
  on public.client_photo_selection_items (gallery_id);
create index if not exists client_photo_selection_items_category_idx
  on public.client_photo_selection_items (gallery_id, category);

alter table public.client_photo_selection_items enable row level security;

drop policy if exists "service role full access client_photo_selection_items"
  on public.client_photo_selection_items;
create policy "service role full access client_photo_selection_items"
  on public.client_photo_selection_items for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
