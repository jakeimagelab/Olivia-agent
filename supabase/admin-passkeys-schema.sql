-- 관리자 패스키(WebAuthn) 로그인
-- 단일 관리자 계정 구조라 user_id FK 없이 자격증명만 저장하는 플랫 테이블.

create table if not exists public.admin_passkeys (
  id                uuid primary key default gen_random_uuid(),
  credential_id     text not null unique,   -- base64url, WebAuthn credential ID
  public_key        text not null,          -- base64url
  counter           bigint not null default 0,
  device_name       text default '',
  transports        text[] default '{}',
  rp_id              text,
  registration_origin text,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz
);
create index if not exists idx_admin_passkeys_credential_id on public.admin_passkeys(credential_id);
alter table public.admin_passkeys add column if not exists rp_id text;
alter table public.admin_passkeys add column if not exists registration_origin text;
create index if not exists idx_admin_passkeys_rp_id on public.admin_passkeys(rp_id) where rp_id is not null;

-- register/login challenge를 서버 세션 없이 stateless하게 검증하기 위한 임시 저장소.
-- 조회 시 5분 지난 challenge는 폐기한다 (lib/passkey.ts).
create table if not exists public.admin_passkey_challenges (
  id          uuid primary key default gen_random_uuid(),
  challenge   text not null,
  type        text not null check (type in ('register','login')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_admin_passkey_challenges_challenge on public.admin_passkey_challenges(challenge);

alter table public.admin_passkeys enable row level security;
alter table public.admin_passkey_challenges enable row level security;

drop policy if exists "service role full access admin_passkeys" on public.admin_passkeys;
create policy "service role full access admin_passkeys"
  on public.admin_passkeys for all
  using (true) with check (true);

drop policy if exists "service role full access admin_passkey_challenges" on public.admin_passkey_challenges;
create policy "service role full access admin_passkey_challenges"
  on public.admin_passkey_challenges for all
  using (true) with check (true);

notify pgrst, 'reload schema';
