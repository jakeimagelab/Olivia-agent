-- 외부 공유 링크 (비밀번호 없는 외부인에게 특정 기능 하나만 열어주는 링크)
create table if not exists public.share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  feature_path text not null,
  label        text default '',
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  use_count    integer not null default 0
);

create index if not exists idx_share_links_token on public.share_links(token);
create index if not exists idx_share_links_created_at on public.share_links(created_at desc);

-- RLS 비활성화 (서버-사이드 service role 사용)
alter table public.share_links enable row level security;

create policy "service role full access share_links"
  on public.share_links for all
  using (true) with check (true);
