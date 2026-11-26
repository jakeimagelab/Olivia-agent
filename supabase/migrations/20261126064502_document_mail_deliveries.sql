create table if not exists public.document_mail_deliveries (
  id uuid primary key,
  request_id uuid not null unique,
  request_hash text not null,
  token_hash text not null unique,
  state text not null check (state in ('preparing', 'sending', 'sent', 'failed')),
  customer_name text not null,
  recipient_email text not null,
  subject text not null,
  quote_id uuid references public.quotes(id) on delete set null,
  statement_id uuid references public.transaction_statements(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  documents jsonb not null default '[]'::jsonb,
  contract_html text,
  contract_sha256 text,
  contract_version_at timestamptz,
  signature_request_id uuid,
  signed_pdf_path text,
  signed_pdf_sha256 text,
  signer_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  sent_at timestamptz
);

create index if not exists document_mail_quote_sent_idx on public.document_mail_deliveries (quote_id, sent_at desc);
create index if not exists document_mail_statement_sent_idx on public.document_mail_deliveries (statement_id, sent_at desc);
create index if not exists document_mail_contract_sent_idx on public.document_mail_deliveries (contract_id, sent_at desc);
create unique index if not exists document_mail_contract_signature_idx on public.document_mail_deliveries (contract_id)
  where signed_at is not null and contract_id is not null;

alter table public.document_mail_deliveries enable row level security;
revoke all on table public.document_mail_deliveries from public, anon, authenticated;
grant select, insert, update on table public.document_mail_deliveries to service_role;

insert into storage.buckets (id, name, public)
values ('document-mail', 'document-mail', false)
on conflict (id) do nothing;

create or replace function public.complete_document_mail_signature(
  p_delivery_id uuid,
  p_token_hash text,
  p_request_id uuid,
  p_signer_name text,
  p_signed_at timestamptz,
  p_pdf_path text,
  p_pdf_sha256 text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_delivery public.document_mail_deliveries%rowtype;
  v_contract_version timestamptz;
begin
  select * into v_delivery from public.document_mail_deliveries
    where id = p_delivery_id and token_hash = p_token_hash
      and state in ('sending', 'sent') and expires_at > now()
    for update;
  if not found then return 'invalid'; end if;
  if v_delivery.signature_request_id = p_request_id then return 'signed'; end if;
  if v_delivery.signed_at is not null then return 'already_signed'; end if;
  if v_delivery.contract_id is null or v_delivery.contract_html is null then return 'invalid'; end if;

  select updated_at into v_contract_version from public.contracts
    where id = v_delivery.contract_id for update;
  if not found then return 'changed'; end if;
  if exists (
    select 1 from public.document_mail_deliveries
    where contract_id = v_delivery.contract_id and signed_at is not null
  ) then return 'already_signed'; end if;
  if v_contract_version is distinct from v_delivery.contract_version_at then return 'changed'; end if;

  update public.document_mail_deliveries set
    signature_request_id = p_request_id, signer_name = p_signer_name,
    signed_at = p_signed_at, signed_pdf_path = p_pdf_path, signed_pdf_sha256 = p_pdf_sha256
  where id = p_delivery_id;
  update public.contracts set status = 'final', updated_at = now() where id = v_delivery.contract_id;
  return 'signed';
end;
$$;

revoke all on function public.complete_document_mail_signature(uuid, text, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.complete_document_mail_signature(uuid, text, uuid, text, timestamptz, text, text) to service_role;

notify pgrst, 'reload schema';
