-- Add signer-specific role and privacy fields without changing existing signature rows.

alter table public.portrait_consent_signatures
  add column if not exists provider_phone text,
  add column if not exists appearance_role text,
  add column if not exists appearance_role_other text,
  add column if not exists is_real_identity boolean,
  add column if not exists consent_sensitive boolean;

create or replace function public.submit_portrait_consent_signature(
  p_portrait_consent_id uuid,
  p_token_hash text,
  p_consent_shoot boolean,
  p_consent_usage boolean,
  p_provider_name text,
  p_signature_data_url text,
  p_signed_date text,
  p_provider_phone text,
  p_appearance_role text,
  p_appearance_role_other text,
  p_is_real_identity boolean,
  p_consent_sensitive boolean,
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
    provider_phone,
    appearance_role,
    appearance_role_other,
    is_real_identity,
    consent_sensitive,
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
    p_provider_phone,
    p_appearance_role,
    p_appearance_role_other,
    p_is_real_identity,
    p_consent_sensitive,
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
  uuid, text, boolean, boolean, text, text, text, text, text, text, boolean, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.submit_portrait_consent_signature(
  uuid, text, boolean, boolean, text, text, text, text, text, text, boolean, boolean, text, text
) to service_role;

notify pgrst, 'reload schema';
