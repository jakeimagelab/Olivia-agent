create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text,
  hospital_name      text not null default '',
  contact_name       text default '',
  email              text default '',
  quote_data         jsonb not null default '{}'::jsonb,
  signature_data_url text,
  -- 채팅 계약 워크플로우(2026-08-30)가 추가한 컬럼 — 상세는
  -- supabase/migrations/20260830_contract_chat_terms.sql 참고.
  status             text not null default 'draft' check (status in ('draft', 'final')),
  deposit_rate       numeric,
  payment_terms      text,
  delivery_terms     text,
  special_terms      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "service role full access" on public.contracts;
create policy "service role full access" on public.contracts
  for all using (true) with check (true);
