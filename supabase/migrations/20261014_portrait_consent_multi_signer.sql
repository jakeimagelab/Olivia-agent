-- One portrait-consent template can collect multiple independent signatures.

alter table public.portrait_consents
  add column if not exists signature_limit integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portrait_consents_signature_limit_check'
      and conrelid = 'public.portrait_consents'::regclass
  ) then
    alter table public.portrait_consents
      add constraint portrait_consents_signature_limit_check
      check (signature_limit between 1 and 100);
  end if;
end $$;

create table if not exists public.portrait_consent_signatures (
  id uuid primary key default gen_random_uuid(),
  portrait_consent_id uuid not null references public.portrait_consents(id) on delete cascade,
  consent_shoot boolean,
  consent_usage boolean,
  provider_name text,
  signature_data_url text,
  signed_date text,
  signed_at timestamptz not null default now(),
  signer_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_portrait_consent_signatures_consent_signed
  on public.portrait_consent_signatures(portrait_consent_id, signed_at desc);

alter table public.portrait_consent_signatures enable row level security;

drop policy if exists "service role portrait consent signatures" on public.portrait_consent_signatures;
create policy "service role portrait consent signatures"
  on public.portrait_consent_signatures for all to service_role
  using (true) with check (true);

grant all on table public.portrait_consent_signatures to service_role;

-- Preserve every existing signed document as the first signer. Reusing the parent id
-- makes the backfill idempotent without imposing a one-signature-per-parent constraint.
insert into public.portrait_consent_signatures (
  id,
  portrait_consent_id,
  consent_shoot,
  consent_usage,
  provider_name,
  signature_data_url,
  signed_date,
  signed_at,
  created_at
)
select
  id,
  id,
  consent_shoot,
  consent_usage,
  provider_name,
  signature_data_url,
  signed_date,
  coalesce(signed_at, updated_at, created_at),
  coalesce(signed_at, updated_at, created_at)
from public.portrait_consents
where status = 'signed'
on conflict (id) do nothing;

create or replace function public.submit_portrait_consent_signature(
  p_portrait_consent_id uuid,
  p_token_hash text,
  p_consent_shoot boolean,
  p_consent_usage boolean,
  p_provider_name text,
  p_signature_data_url text,
  p_signed_date text,
  p_signer_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_consent public.portrait_consents%rowtype;
  v_signature public.portrait_consent_signatures%rowtype;
  v_signature_count integer;
begin
  select *
  into v_consent
  from public.portrait_consents
  where id = p_portrait_consent_id
    and token_hash = p_token_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', '유효하지 않은 링크입니다.');
  end if;

  if v_consent.token_revoked_at is not null then
    return jsonb_build_object('ok', false, 'code', 'revoked', 'error', '취소된 링크입니다.');
  end if;

  if v_consent.token_expires_at is not null and v_consent.token_expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'expired', 'error', '만료된 링크입니다.');
  end if;

  select count(*)::integer
  into v_signature_count
  from public.portrait_consent_signatures
  where portrait_consent_id = v_consent.id;

  if v_signature_count >= v_consent.signature_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'complete',
      'error', '필요한 서명이 모두 제출되었습니다.',
      'signatureCount', v_signature_count,
      'signatureLimit', v_consent.signature_limit
    );
  end if;

  insert into public.portrait_consent_signatures (
    portrait_consent_id,
    consent_shoot,
    consent_usage,
    provider_name,
    signature_data_url,
    signed_date,
    signed_at,
    signer_ip,
    user_agent
  ) values (
    v_consent.id,
    p_consent_shoot,
    p_consent_usage,
    p_provider_name,
    p_signature_data_url,
    p_signed_date,
    now(),
    p_signer_ip,
    p_user_agent
  )
  returning * into v_signature;

  v_signature_count := v_signature_count + 1;

  update public.portrait_consents
  set
    status = case when v_signature_count >= signature_limit then 'signed' else 'sent' end,
    signed_at = case when v_signature_count >= signature_limit then v_signature.signed_at else signed_at end,
    last_accessed_at = now()
  where id = v_consent.id;

  return jsonb_build_object(
    'ok', true,
    'signature', to_jsonb(v_signature),
    'signatureCount', v_signature_count,
    'signatureLimit', v_consent.signature_limit,
    'complete', v_signature_count >= v_consent.signature_limit
  );
end;
$$;

revoke all on function public.submit_portrait_consent_signature(
  uuid, text, boolean, boolean, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_portrait_consent_signature(
  uuid, text, boolean, boolean, text, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';
