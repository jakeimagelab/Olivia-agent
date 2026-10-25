alter table public.conti_scenes
  add column if not exists shot_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conti_scenes_shot_type_check'
      and conrelid = 'public.conti_scenes'::regclass
  ) then
    alter table public.conti_scenes
      add constraint conti_scenes_shot_type_check
      check (shot_type in ('scene', 'group', 'profile', 'interior', 'video')) not valid;
  end if;
end $$;

alter table public.conti_scenes validate constraint conti_scenes_shot_type_check;
notify pgrst, 'reload schema';
