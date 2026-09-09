-- 20260909 파일이 운영 DB에 적용되지 않은 상태도 복구할 수 있도록 테이블 생성부터 포함한다.
create table if not exists public.olivia_desktop_settings (
  id                        uuid primary key default gen_random_uuid(),
  wallpaper_mode            text not null default 'original' check (wallpaper_mode in ('original', 'soft', 'custom')),
  custom_wallpaper_data_url text,
  updated_at                timestamptz not null default now()
);

-- 모든 앱 즐겨찾기를 배경화면과 같은 전역 데스크톱 설정 행에 저장한다.
-- 한 행만 조회하므로 배열 원소용 인덱스는 만들지 않는다.
alter table public.olivia_desktop_settings
  add column if not exists favorite_app_keys text[] not null default array[
    '/calendar',
    '/quote',
    '/conti',
    '/photo-sorting',
    '/memo',
    '/clients'
  ]::text[];

insert into public.olivia_desktop_settings (wallpaper_mode)
select 'original'
where not exists (select 1 from public.olivia_desktop_settings);

drop trigger if exists olivia_desktop_settings_updated_at on public.olivia_desktop_settings;
create trigger olivia_desktop_settings_updated_at
  before update on public.olivia_desktop_settings
  for each row execute procedure public.set_updated_at();

alter table public.olivia_desktop_settings enable row level security;

drop policy if exists "service role full access olivia desktop settings" on public.olivia_desktop_settings;
create policy "service role full access olivia desktop settings"
  on public.olivia_desktop_settings for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
