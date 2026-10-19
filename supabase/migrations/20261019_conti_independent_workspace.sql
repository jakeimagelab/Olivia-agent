-- 독립 촬영 콘티: 장면 정의와 의료진별 타임테이블 전개를 분리하고,
-- 병원 작성용 공유 링크에 필요한 상태만 확장한다. 기존 행은 그대로 유지한다.
alter table public.conti_runs
  add column if not exists doctors jsonb not null default '[]'::jsonb;

alter table public.conti_scenes
  add column if not exists scene_code text,
  add column if not exists repeat_scope text not null default 'once',
  add column if not exists media text not null default 'photo';

alter table public.conti_run_shares
  add column if not exists can_edit boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists submitted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conti_scenes_repeat_scope_check'
      and conrelid = 'public.conti_scenes'::regclass
  ) then
    alter table public.conti_scenes
      add constraint conti_scenes_repeat_scope_check
      check (repeat_scope in ('once', 'per_doctor', 'per_doctor_pair')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'conti_scenes_media_check'
      and conrelid = 'public.conti_scenes'::regclass
  ) then
    alter table public.conti_scenes
      add constraint conti_scenes_media_check
      check (media in ('photo', 'photo_video', 'none')) not valid;
  end if;
end $$;

alter table public.conti_scenes validate constraint conti_scenes_repeat_scope_check;
alter table public.conti_scenes validate constraint conti_scenes_media_check;

-- 기존 audience 제약은 hospital 값을 모르므로 이름을 조회한 뒤 안전하게 교체한다.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.conti_run_shares'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%audience%';

  if constraint_name is not null then
    execute format('alter table public.conti_run_shares drop constraint %I', constraint_name);
  end if;
  alter table public.conti_run_shares
    add constraint conti_run_shares_audience_check
    check (audience in ('customer', 'staff', 'hospital'));
end $$;

notify pgrst, 'reload schema';
