-- 캘린더 일정별 올리비아 텔레그램 알람
-- 반복 실행 가능한 additive migration입니다.

alter table public.calendar_tasks
  add column if not exists time text,
  add column if not exists end_time text,
  add column if not exists location text;

alter table public.calendar_tasks
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_minutes_before integer not null default 30,
  add column if not exists reminder_due_at timestamptz,
  add column if not exists reminder_claimed_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists reminder_attempts integer not null default 0,
  add column if not exists reminder_last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_tasks_reminder_minutes_check') then
    alter table public.calendar_tasks add constraint calendar_tasks_reminder_minutes_check
      check (reminder_minutes_before in (0, 10, 30, 60, 1440));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'calendar_tasks_reminder_time_check') then
    alter table public.calendar_tasks add constraint calendar_tasks_reminder_time_check
      check (not reminder_enabled or time is not null);
  end if;
end $$;

create index if not exists calendar_tasks_due_reminder_idx
  on public.calendar_tasks(reminder_due_at, id)
  where reminder_enabled = true and reminder_sent_at is null and completed = false;

create or replace function public.claim_due_calendar_reminders(p_limit integer default 25)
returns setof public.calendar_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.calendar_tasks
    where reminder_enabled = true
      and completed = false
      and reminder_due_at is not null
      and reminder_due_at <= now()
      and reminder_sent_at is null
      and reminder_attempts < 3
      and (reminder_claimed_at is null or reminder_claimed_at < now() - interval '10 minutes')
    order by reminder_due_at, id
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.calendar_tasks task
  set reminder_claimed_at = now(),
      reminder_attempts = task.reminder_attempts + 1,
      updated_at = now()
  from candidates
  where task.id = candidates.id
  returning task.*;
end;
$$;

revoke all on function public.claim_due_calendar_reminders(integer) from public;
grant execute on function public.claim_due_calendar_reminders(integer) to service_role;
notify pgrst, 'reload schema';
