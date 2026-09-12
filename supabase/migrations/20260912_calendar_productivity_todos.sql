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

-- 코드가 마이그레이션보다 먼저 배포된 동안 생성된 호환 To-do를 새 전용 테이블로 옮긴다.
insert into public.calendar_todos (id, title, completed, sort_order, created_at, updated_at)
select
  id,
  title,
  completed,
  row_number() over (order by created_at, id)::integer - 1,
  created_at,
  updated_at
from public.calendar_tasks
where date = date '9999-12-31'
  and memo = '__olivia_calendar_todo__'
on conflict (id) do nothing;

delete from public.calendar_tasks
where date = date '9999-12-31'
  and memo = '__olivia_calendar_todo__';

drop trigger if exists calendar_todos_updated_at on public.calendar_todos;
create trigger calendar_todos_updated_at
  before update on public.calendar_todos
  for each row execute procedure public.set_updated_at();

alter table public.calendar_todos enable row level security;

drop policy if exists "service role full access calendar_todos" on public.calendar_todos;
create policy "service role full access calendar_todos"
  on public.calendar_todos for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
