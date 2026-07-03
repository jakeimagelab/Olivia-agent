-- 포토클리닉 견적서 저장
create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  quote_number    text not null,
  title           text default '',
  hospital_name   text not null default '',
  contact_name    text default '',
  phone           text default '',
  email           text default '',
  quote_date      text default '',
  shoot_date      text,
  valid_until     text default '',
  items           jsonb not null default '[]'::jsonb,
  supply_amount   numeric not null default 0,
  discount_amount numeric not null default 0,
  vat             numeric not null default 0,
  total_amount    numeric not null default 0,
  deposit_amount  numeric not null default 0,
  balance_amount  numeric not null default 0,
  deposit_rate    numeric not null default 50,
  memos           text,
  form_state      jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_quotes_created_at   on public.quotes(created_at desc);
create index if not exists idx_quotes_quote_number on public.quotes(quote_number);

-- RLS 비활성화 (서버-사이드 service role 사용)
alter table public.quotes enable row level security;

create policy "service role full access quotes"
  on public.quotes for all
  using (true) with check (true);
