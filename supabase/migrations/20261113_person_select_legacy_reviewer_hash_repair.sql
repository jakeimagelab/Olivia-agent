-- 운영 DB의 pgcrypto digest 함수 탐색 경로/시그니처 차이와 무관하게
-- 프로젝트 공유용 호환 검토자를 만들 수 있도록 trigger를 보정한다.
-- 기존 프로젝트, 사진, 참가자, 셀렉 데이터는 변경하거나 삭제하지 않는다.

create or replace function public.person_select_legacy_reviewer_hash(p_event_id uuid)
returns text
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select
    md5('person-select-legacy:' || p_event_id::text)
    || md5('person-select-legacy:v2:' || p_event_id::text)
$$;

create or replace function public.ensure_person_select_legacy_reviewer()
returns trigger
language plpgsql
security definer
set search_path = public
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
      public.person_select_legacy_reviewer_hash(new.id),
      true,
      true
    ) on conflict do nothing;
  end if;
  return new;
end
$$;

-- 앞선 trigger 오류 때문에 빠진 공유 프로젝트의 호환 검토자만 보충한다.
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
  public.person_select_legacy_reviewer_hash(event.id),
  true,
  true
from public.person_select_events event
where event.access_mode = 'project_shared'
on conflict do nothing;

notify pgrst, 'reload schema';
