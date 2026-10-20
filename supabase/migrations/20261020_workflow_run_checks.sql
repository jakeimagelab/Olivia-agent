alter table public.workflow_runs
  add column if not exists checks jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
