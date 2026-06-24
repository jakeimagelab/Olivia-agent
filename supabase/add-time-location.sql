-- calendar_tasks 에 시간/장소 컬럼 추가
-- Supabase → SQL Editor → New Query에 붙여넣고 Run

alter table public.calendar_tasks
  add column if not exists time     text default null,  -- 'HH:MM' 형식, null=종일
  add column if not exists location text default null;
