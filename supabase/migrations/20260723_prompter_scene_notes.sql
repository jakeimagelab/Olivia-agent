alter table public.prompter_scripts
  add column if not exists notes text not null default '';

notify pgrst, 'reload schema';
