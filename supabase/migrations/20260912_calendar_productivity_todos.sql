create table if not exists public.calendar_todos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_todos_sort_idx
  on public.calendar_todos (completed, sort_order, created_at);

drop trigger if exists calendar_todos_updated_at on public.calendar_todos;
create trigger calendar_todos_updated_at
  before update on public.calendar_todos
  for each row execute procedure public.set_updated_at();

alter table public.calendar_todos enable row level security;

drop policy if exists "service role full access calendar_todos" on public.calendar_todos;
create policy "service role full access calendar_todos"
  on public.calendar_todos for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
