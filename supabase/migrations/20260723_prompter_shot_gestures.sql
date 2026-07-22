alter table public.prompter_scripts
  add column if not exists is_shot boolean not null default false,
  add column if not exists gesture_map jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
