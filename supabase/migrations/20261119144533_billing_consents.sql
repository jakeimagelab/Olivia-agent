-- 비용 청구 동의서 전자서명
-- 공개 클라이언트는 테이블과 Storage에 직접 접근하지 않고 서버 API만 사용한다.

create table if not exists public.billing_consents (
  id uuid primary key default gen_random_uuid(),
  document_id text not null unique,
  customer_id uuid not null references public.clients(id) on delete restrict,
  contract_id uuid null references public.contracts(id) on delete set null,
  quote_id uuid null references public.quotes(id) on delete set null,
  workflow_run_id uuid null references public.workflow_runs(id) on delete set null,
  supersedes_id uuid null references public.billing_consents(id) on delete set null,
  version integer not null default 1 check (version > 0),

  customer_snapshot jsonb not null default '{}'::jsonb,
  issuer_snapshot jsonb not null default '{}'::jsonb,
  contract_snapshot jsonb null,
  items jsonb not null default '[]'::jsonb,
  subtotal bigint not null default 0 check (subtotal >= 0),
  vat bigint not null default 0 check (vat >= 0),
  total bigint not null default 0 check (total >= 0),
  reason text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  bank_info text not null default '',
  due_date date null,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'viewed', 'signed', 'disputed', 'expired', 'canceled')),
  token_hash text null unique,
  expires_at timestamptz null,
  sent_at timestamptz null,
  last_viewed_at timestamptz null,

  verification_channel text not null default 'email'
    check (verification_channel in ('email', 'sms')),
  verification_target_hash text null,
  verification_target_masked text null,
  auth_cookie_version integer not null default 1 check (auth_cookie_version > 0),

  signer_name text null,
  consent_checks jsonb null,
  signed_at timestamptz null,
  signed_ip inet null,
  signed_ua text null,
  signature_path text null,
  signature_sha256 text null,
  document_evidence_sha256 text null,
  pdf_path text null,
  pdf_sha256 text null,
  pdf_generated_at timestamptz null,

  objection_reason text null,
  disputed_at timestamptz null,
  canceled_at timestamptz null,
  payment_confirmed_at timestamptz null,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_consents_customer_created_idx
  on public.billing_consents (customer_id, created_at desc);
create index if not exists billing_consents_status_created_idx
  on public.billing_consents (status, created_at desc);
create index if not exists billing_consents_contract_idx
  on public.billing_consents (contract_id) where contract_id is not null;
create index if not exists billing_consents_quote_idx
  on public.billing_consents (quote_id) where quote_id is not null;
create index if not exists billing_consents_workflow_idx
  on public.billing_consents (workflow_run_id) where workflow_run_id is not null;
create index if not exists billing_consents_expires_idx
  on public.billing_consents (expires_at) where status in ('sent', 'viewed');

create table if not exists public.billing_consent_events (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.billing_consents(id) on delete restrict,
  type text not null check (type in (
    'created', 'previewed', 'sent', 'email_sent', 'email_failed', 'viewed',
    'otp_requested', 'otp_failed', 'otp_verified', 'signed', 'disputed',
    'pdf_downloaded', 'resent', 'canceled', 'payment_confirmed',
    'verified_match', 'verified_mismatch'
  )),
  at timestamptz not null default now(),
  ip inet null,
  ua text null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists billing_consent_events_consent_at_idx
  on public.billing_consent_events (consent_id, at desc);
create index if not exists billing_consent_events_type_at_idx
  on public.billing_consent_events (type, at desc);

create table if not exists public.billing_consent_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references public.billing_consents(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  target_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz null,
  verified_at timestamptz null,
  invalidated_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists billing_consent_challenges_active_idx
  on public.billing_consent_auth_challenges (consent_id, created_at desc)
  where verified_at is null and invalidated_at is null;

create or replace function public.billing_consent_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.billing_consent_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and row(
    new.customer_id, new.contract_id, new.quote_id, new.workflow_run_id,
    new.supersedes_id, new.version, new.customer_snapshot, new.issuer_snapshot,
    new.contract_snapshot, new.items, new.subtotal, new.vat, new.total,
    new.reason, new.evidence, new.bank_info, new.due_date, new.token_hash,
    new.expires_at, new.verification_channel, new.verification_target_hash,
    new.verification_target_masked
  ) is distinct from row(
    old.customer_id, old.contract_id, old.quote_id, old.workflow_run_id,
    old.supersedes_id, old.version, old.customer_snapshot, old.issuer_snapshot,
    old.contract_snapshot, old.items, old.subtotal, old.vat, old.total,
    old.reason, old.evidence, old.bank_info, old.due_date, old.token_hash,
    old.expires_at, old.verification_channel, old.verification_target_hash,
    old.verification_target_masked
  ) then
    raise exception 'billing_consent_document_locked' using errcode = 'PT409';
  end if;

  if old.status = 'signed' and row(
    new.status, new.signer_name, new.consent_checks, new.signed_at,
    new.signed_ip, new.signed_ua, new.signature_path, new.signature_sha256,
    new.document_evidence_sha256, new.pdf_path, new.pdf_sha256,
    new.pdf_generated_at, new.auth_cookie_version
  ) is distinct from row(
    old.status, old.signer_name, old.consent_checks, old.signed_at,
    old.signed_ip, old.signed_ua, old.signature_path, old.signature_sha256,
    old.document_evidence_sha256, old.pdf_path, old.pdf_sha256,
    old.pdf_generated_at, old.auth_cookie_version
  ) then
    raise exception 'billing_consent_signature_locked' using errcode = 'PT409';
  end if;

  return new;
end;
$$;

create or replace function public.billing_consent_guard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'billing_consent_document_locked' using errcode = 'PT409';
  end if;
  return old;
end;
$$;

create or replace function public.billing_consent_event_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'billing_consent_events_are_append_only' using errcode = 'PT409';
end;
$$;

drop trigger if exists billing_consents_updated_at on public.billing_consents;
create trigger billing_consents_updated_at
  before update on public.billing_consents
  for each row execute function public.billing_consent_set_updated_at();

drop trigger if exists billing_consents_guard_immutable on public.billing_consents;
create trigger billing_consents_guard_immutable
  before update on public.billing_consents
  for each row execute function public.billing_consent_guard_immutable();

drop trigger if exists billing_consents_guard_delete on public.billing_consents;
create trigger billing_consents_guard_delete
  before delete on public.billing_consents
  for each row execute function public.billing_consent_guard_delete();

drop trigger if exists billing_consent_events_append_only on public.billing_consent_events;
create trigger billing_consent_events_append_only
  before update or delete on public.billing_consent_events
  for each row execute function public.billing_consent_event_append_only();

revoke all on function public.billing_consent_set_updated_at() from public, anon, authenticated;
revoke all on function public.billing_consent_guard_immutable() from public, anon, authenticated;
revoke all on function public.billing_consent_guard_delete() from public, anon, authenticated;
revoke all on function public.billing_consent_event_append_only() from public, anon, authenticated;

alter table public.billing_consents enable row level security;
alter table public.billing_consent_events enable row level security;
alter table public.billing_consent_auth_challenges enable row level security;

revoke all on table public.billing_consents from anon, authenticated;
revoke all on table public.billing_consent_events from anon, authenticated;
revoke all on table public.billing_consent_auth_challenges from anon, authenticated;

drop policy if exists "service role billing consents" on public.billing_consents;
create policy "service role billing consents"
  on public.billing_consents for all to service_role
  using (true) with check (true);

drop policy if exists "service role billing consent events" on public.billing_consent_events;
create policy "service role billing consent events"
  on public.billing_consent_events for all to service_role
  using (true) with check (true);

drop policy if exists "service role billing consent auth challenges" on public.billing_consent_auth_challenges;
create policy "service role billing consent auth challenges"
  on public.billing_consent_auth_challenges for all to service_role
  using (true) with check (true);

grant all on table public.billing_consents to service_role;
grant all on table public.billing_consent_events to service_role;
grant all on table public.billing_consent_auth_challenges to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'billing-consents',
  'billing-consents',
  false,
  26214400,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
