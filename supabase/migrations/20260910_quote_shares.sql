-- Mobile Preview용 견적 공유 토큰. conti_run_shares와 동일 패턴 — 토큰은 항상 최신
-- quotes row를 그대로 가리키므로(스냅샷 아님) Hermes가 나중에 항목/금액을 수정해도
-- 같은 링크로 최신 상태가 보인다.
create table if not exists public.quote_shares (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists quote_shares_quote_idx on public.quote_shares(quote_id);

alter table public.quote_shares enable row level security;

drop policy if exists "service role full access quote shares" on public.quote_shares;
create policy "service role full access quote shares" on public.quote_shares for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
