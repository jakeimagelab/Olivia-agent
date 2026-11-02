-- 개인별 사진 셀렉 보완 (2026-10-31)
-- 1) 항목마다 여러 장을 고를 수 있게 한다: (사람, 항목) 1장 제한을 (사람, 사진) 중복 금지로 바꾼다.
-- 2) 사진을 가져온 폴더를 행사에 기록해 RAW 매칭이 같은 폴더에서 원본을 찾게 한다.

drop index if exists public.person_select_choices_person_category_idx;
create unique index if not exists person_select_choices_person_image_idx on public.person_select_choices(person_id, image_id);
create index if not exists person_select_choices_person_category_lookup_idx on public.person_select_choices(person_id, category_key);

alter table public.person_select_events add column if not exists source_relative_path text;
alter table public.person_select_events add column if not exists source_layout text not null default 'school';
alter table public.person_select_events add column if not exists raw_match_result jsonb;
alter table public.person_select_events add column if not exists raw_matched_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'person_select_events_source_layout_check') then
    alter table public.person_select_events add constraint person_select_events_source_layout_check check (source_layout in ('school', 'person-folders'));
  end if;
end $$;

comment on table public.remote_jobs is
  'Mac Studio remote jobs. PERSON_SELECT_IMPORT (2026-10-19) and PERSON_SELECT_RAW_MATCH (2026-10-31) are allowed actions.';

notify pgrst, 'reload schema';
