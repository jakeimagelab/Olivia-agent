create or replace function public.insert_transaction_statement_from_quote(
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

notify pgrst, 'reload schema';
