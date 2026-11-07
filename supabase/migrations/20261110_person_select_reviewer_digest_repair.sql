-- Supabase는 pgcrypto를 extensions schema에 설치한다.
-- 기존 trigger가 public-only search_path에서 digest를 찾지 못하는 운영 오류를 무삭제 보정한다.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.ensure_person_select_legacy_reviewer()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.access_mode = 'project_shared' then
    insert into public.person_select_shared_reviewers(
      event_id, display_name, role_label, access_token_hash, active, is_legacy
    ) values (
      new.id,
      '기존 공동 셀렉',
      '호환',
      encode(extensions.digest(convert_to('person-select-legacy:' || new.id::text, 'UTF8'), 'sha256'::text), 'hex'),
      true,
      true
    ) on conflict do nothing;
  end if;
  return new;
end $$;

-- 이전 오류로 호환 검토자가 생성되지 않은 공유 프로젝트만 보충한다.
insert into public.person_select_shared_reviewers(
  event_id, display_name, role_label, access_token_hash, active, is_legacy
)
select
  event.id,
  '기존 공동 셀렉',
  '호환',
  encode(extensions.digest(convert_to('person-select-legacy:' || event.id::text, 'UTF8'), 'sha256'::text), 'hex'),
  true,
  true
from public.person_select_events event
where event.access_mode = 'project_shared'
on conflict do nothing;

notify pgrst, 'reload schema';
