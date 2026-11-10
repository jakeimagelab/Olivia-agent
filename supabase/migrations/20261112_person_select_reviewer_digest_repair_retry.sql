-- 운영 DB에 예전 trigger 본문이 남아 digest(text, unknown)를 호출하는 경우를
-- 다시 보정한다. 기존 프로젝트/사진/셀렉 데이터는 변경하지 않는다.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.ensure_person_select_legacy_reviewer()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.access_mode = 'project_shared' then
    insert into public.person_select_shared_reviewers(
      event_id,
      display_name,
      role_label,
      access_token_hash,
      active,
      is_legacy
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
end
$$;

-- 앞선 오류 때문에 호환 검토자가 만들어지지 않은 공유 프로젝트만 보충한다.
insert into public.person_select_shared_reviewers(
  event_id,
  display_name,
  role_label,
  access_token_hash,
  active,
  is_legacy
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
