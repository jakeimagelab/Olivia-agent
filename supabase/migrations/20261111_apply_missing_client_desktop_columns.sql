alter table public.clients
  add column if not exists director_name text default '',
  add column if not exists address text default '',
  add column if not exists website_url text default '',
  add column if not exists instagram_url text default '',
  add column if not exists naver_place_url text default '',
  add column if not exists manager_staff text default '',
  add column if not exists referral_source text default '',
  add column if not exists notes text default '';

create index if not exists idx_clients_manager_staff on public.clients(manager_staff);

alter table public.olivia_desktop_settings
  add column if not exists favorite_app_keys text[] not null default array['/calendar','/quote','/conti','/photo-sorting','/memo','/clients']::text[];

notify pgrst, 'reload schema';
