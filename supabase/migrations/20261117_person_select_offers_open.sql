-- 액자·앨범 공개 여부는 프로젝트별로 명시적으로 연다.
-- 기존 프로젝트는 비공개로 시작하되 이미 주문이 들어온 프로젝트만 공개 상태를 유지한다.

alter table public.person_select_events
  add column if not exists offers_open boolean not null default false;

update public.person_select_events as event
set offers_open = true
where exists (
  select 1
  from public.person_select_people as person
  where person.event_id = event.id
    and jsonb_typeof(coalesce(person.orders, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(person.orders, '[]'::jsonb)) > 0
);

notify pgrst, 'reload schema';

