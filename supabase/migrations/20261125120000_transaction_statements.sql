create table public.transaction_statements (
  id uuid primary key default gen_random_uuid(),
  statement_number text not null unique,
  quote_id uuid references public.quotes(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  brand text not null check (brand in ('photoclinic', 'jakeimage')),
  transaction_date date not null,
  shoot_date date,
  snapshot jsonb not null,
  pdf_path text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'confirmed')),
  sent_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text,
  receipt_token_hash text unique,
  send_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transaction_statements enable row level security;
revoke all on public.transaction_statements from public, anon, authenticated, service_role;
grant select, insert on public.transaction_statements to service_role;
grant update (pdf_path, status, sent_at, confirmed_at, confirmed_by, receipt_token_hash, send_attempt_id, updated_at)
  on public.transaction_statements to service_role;

create index transaction_statements_quote_id_idx on public.transaction_statements (quote_id);
create index transaction_statements_client_id_idx on public.transaction_statements (client_id);

create table public.transaction_statement_daily_numbers (
  transaction_date date primary key,
  last_number integer not null
);
alter table public.transaction_statement_daily_numbers enable row level security;
revoke all on public.transaction_statement_daily_numbers from public, anon, authenticated;
grant select, insert, update on public.transaction_statement_daily_numbers to service_role;

create function public.next_transaction_statement_number(statement_date date)
returns text language sql set search_path = '' as $$
  insert into public.transaction_statement_daily_numbers as counters (transaction_date, last_number)
  values (statement_date, 1)
  on conflict (transaction_date) do update set last_number = counters.last_number + 1
  returning 'TS-' || to_char(statement_date, 'YYYYMMDD') || '-' ||
    lpad(last_number::text, greatest(2, length(last_number::text)), '0');
$$;
revoke all on function public.next_transaction_statement_number(date) from public, anon, authenticated;
grant execute on function public.next_transaction_statement_number(date) to service_role;

create function public.insert_transaction_statement_from_quote(
  source_id uuid, source_version timestamptz, statement_date date, shooting_date date, statement_snapshot jsonb
)
returns table(id uuid, statement_number text)
language plpgsql set search_path = '' as $$
declare
  source_quote public.quotes%rowtype;
begin
  select q.* into source_quote from public.quotes q where q.id = source_id for share;
  if not found then
    raise exception using errcode = 'PT404', message = 'quote_not_found';
  end if;
  if coalesce(source_quote.status, '') not in ('published', 'final') then
    raise exception using errcode = 'PT409', message = 'quote_not_approved';
  end if;
  if source_quote.updated_at is distinct from source_version then
    raise exception using errcode = 'PT409', message = 'quote_changed';
  end if;

  return query
  insert into public.transaction_statements as s (
    statement_number, quote_id, client_id, brand, transaction_date, shoot_date, snapshot
  ) values (
    public.next_transaction_statement_number(statement_date), source_quote.id, source_quote.client_id,
    statement_snapshot #>> '{document,brand}', statement_date, shooting_date, statement_snapshot
  )
  returning s.id, s.statement_number;
end;
$$;
revoke all on function public.insert_transaction_statement_from_quote(uuid, timestamptz, date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.insert_transaction_statement_from_quote(uuid, timestamptz, date, date, jsonb)
  to service_role;

insert into storage.buckets (id, name, public)
values ('transaction-statements', 'transaction-statements', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
