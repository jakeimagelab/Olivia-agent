-- 데스크탑 배경화면을 컴퓨터마다 다른 localStorage 대신 DB로 동기화한다. 로그인 계정이
-- 관리자 1명뿐이라(비밀번호 하나) 사용자별 구분 없이 전역 설정 1행만 둔다.
create table if not exists public.olivia_desktop_settings (
  id                     uuid primary key default gen_random_uuid(),
  wallpaper_mode         text not null default 'original' check (wallpaper_mode in ('original', 'soft', 'custom')),
  custom_wallpaper_data_url text,
  updated_at             timestamptz not null default now()
);

insert into public.olivia_desktop_settings (wallpaper_mode)
select 'original'
where not exists (select 1 from public.olivia_desktop_settings);

drop trigger if exists olivia_desktop_settings_updated_at on public.olivia_desktop_settings;
create trigger olivia_desktop_settings_updated_at
  before update on public.olivia_desktop_settings
  for each row execute procedure public.set_updated_at();

alter table public.olivia_desktop_settings enable row level security;

drop policy if exists "service role full access olivia desktop settings" on public.olivia_desktop_settings;
create policy "service role full access olivia desktop settings" on public.olivia_desktop_settings for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
