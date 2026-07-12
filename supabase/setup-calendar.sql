-- ══════════════════════════════════════════════════════════════
-- 업무 캘린더 테이블 셋업
-- Supabase → SQL Editor → New Query에 붙여넣고 Run
-- ══════════════════════════════════════════════════════════════

create table if not exists public.calendar_tasks (
  id          uuid primary key default gen_random_uuid(),
  date        text not null,          -- 'YYYY-MM-DD'
  title       text not null,
  memo        text not null default '',
  category    text not null default 'general'
              check (category in ('shooting','client','admin','personal','general')),
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists calendar_tasks_date_idx on public.calendar_tasks (date);

drop trigger if exists calendar_tasks_updated_at on public.calendar_tasks;
create trigger calendar_tasks_updated_at
  before update on public.calendar_tasks
  for each row execute procedure public.set_updated_at();

alter table public.calendar_tasks enable row level security;

drop policy if exists "service role full access calendar_tasks" on public.calendar_tasks;
create policy "service role full access calendar_tasks"
  on public.calendar_tasks for all to service_role using (true) with check (true);
