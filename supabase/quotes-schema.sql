-- 포토클리닉 견적서 저장
-- 신규 설치와 기존 부분 설치 모두에 반복 실행할 수 있는 additive 마이그레이션입니다.
create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  quote_number    text not null,
  title           text default '',
  hospital_name   text not null default '',
  client_id       uuid,
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
  status          text not null default 'draft',
  package_id      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 예전에 생성된 quotes 테이블에도 현재 API가 요구하는 컬럼을 보강한다.
alter table public.quotes
  add column if not exists client_id uuid,
  add column if not exists status text not null default 'draft',
  add column if not exists package_id text,
  add column if not exists updated_at timestamptz not null default now();

-- clients가 존재할 때만 FK를 추가한다. 이미 연결된 DB에서도 안전하게 재실행된다.
do $$
begin
  if to_regclass('public.clients') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'quotes_client_id_fkey'
         and conrelid = 'public.quotes'::regclass
     ) then
    alter table public.quotes
      add constraint quotes_client_id_fkey
      foreign key (client_id) references public.clients(id) on delete set null;
  end if;
end $$;

create index if not exists idx_quotes_created_at   on public.quotes(created_at desc);
create index if not exists idx_quotes_quote_number on public.quotes(quote_number);
create index if not exists idx_quotes_client_id    on public.quotes(client_id);

-- 견적 데이터는 서버의 service role만 접근한다.
alter table public.quotes enable row level security;

drop policy if exists "service role full access quotes" on public.quotes;
create policy "service role full access quotes"
  on public.quotes for all to service_role
  using (true) with check (true);

grant all on table public.quotes to service_role;

-- SQL 실행 직후 PostgREST가 새 테이블을 인식하도록 스키마 캐시를 갱신한다.
notify pgrst, 'reload schema';
