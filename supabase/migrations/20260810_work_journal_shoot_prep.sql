-- 업무일지 — 촬영 실무 개편(Phase 1). "일정"은 새 테이블을 만들지 않고 기존 calendar_tasks를 그대로 쓰고,
-- 그 아래 촬영 준비물(To-do/장비/렌탈)만 새로 붙인다. category='shooting' 일정에서만 화면에 노출된다.
-- docs/superpowers/specs/2026-08-10-work-journal-shoot-day-redesign-design.md
-- work_journal_tasks 계열과 동일하게 RLS 없이 미들웨어(관리자 세션) + service role 접근 패턴을 따른다.

create table if not exists public.schedule_todos (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.calendar_tasks(id) on delete cascade,
  title         text not null,
  completed     boolean not null default false,
  assignee      text,
  memo          text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_schedule_todos_schedule_id on public.schedule_todos(schedule_id);

create table if not exists public.equipment (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null check (category in ('LIGHT','CAMERA','COMPUTER','ETC')),
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.schedule_equipment (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.calendar_tasks(id) on delete cascade,
  equipment_id  uuid not null references public.equipment(id) on delete cascade,
  selected      boolean not null default false,
  checked       boolean not null default false,
  memo          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (schedule_id, equipment_id)
);
create index if not exists idx_schedule_equipment_schedule_id on public.schedule_equipment(schedule_id);

create table if not exists public.schedule_rentals (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.calendar_tasks(id) on delete cascade,
  name          text not null,
  checked       boolean not null default false,
  memo          text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_schedule_rentals_schedule_id on public.schedule_rentals(schedule_id);

-- 장비 마스터 시드 — 카테고리별 sort_order는 1부터 순서대로 (LIGHT 17 / CAMERA 14 / COMPUTER 12 / ETC 4 = 총 47개).
insert into public.equipment (name, category, sort_order) values
  ('Profoto B10X Duo Kit', 'LIGHT', 1),
  ('Profoto A10 Duo Kit', 'LIGHT', 2),
  ('Godox BI300', 'LIGHT', 3),
  ('고보 렌즈 조명', 'LIGHT', 4),
  ('라임라이트 i6 TTL', 'LIGHT', 5),
  ('라임라이트 i4 TTL', 'LIGHT', 6),
  ('포멕스 E600', 'LIGHT', 7),
  ('오로라 대형 소프트박스 100×180', 'LIGHT', 8),
  ('오로라 중형 소프트박스 90×120', 'LIGHT', 9),
  ('오로라 긴 사각 소프트박스 30×120', 'LIGHT', 10),
  ('오로라 대형 우산', 'LIGHT', 11),
  ('A-Stand', 'LIGHT', 12),
  ('Profoto Connect Pro', 'LIGHT', 13),
  ('Profoto Connect Sony', 'LIGHT', 14),
  ('Profoto Connect Canon', 'LIGHT', 15),
  ('라임라이트 Connect Sony', 'LIGHT', 16),
  ('라임라이트 Connect Canon', 'LIGHT', 17),
  ('Canon 5D Mark IV', 'CAMERA', 1),
  ('Sony A7R V', 'CAMERA', 2),
  ('Sony A7 IV', 'CAMERA', 3),
  ('Sony A7R III', 'CAMERA', 4),
  ('Canon 24-70', 'CAMERA', 5),
  ('Canon 16-35', 'CAMERA', 6),
  ('Sony 35', 'CAMERA', 7),
  ('Sony 24-70', 'CAMERA', 8),
  ('Sony 85', 'CAMERA', 9),
  ('Sony 135', 'CAMERA', 10),
  ('시루이 영상 삼각대', 'CAMERA', 11),
  ('시루이 사진 삼각대', 'CAMERA', 12),
  ('DJI Ronin 4 Mini', 'CAMERA', 13),
  ('DJI Mic Mini 2', 'CAMERA', 14),
  ('MacBook Pro 16"', 'COMPUTER', 1),
  ('iPad Pro 12.9"', 'COMPUTER', 2),
  ('Lexar Type A 80GB', 'COMPUTER', 3),
  ('Lexar SD 64GB', 'COMPUTER', 4),
  ('Lexar SD 32GB', 'COMPUTER', 5),
  ('Sony SD 128GB', 'COMPUTER', 6),
  ('Sony SD 64GB', 'COMPUTER', 7),
  ('Seagate SSD 1TB', 'COMPUTER', 8),
  ('SanDisk SSD 2TB', 'COMPUTER', 9),
  ('Tether Tools 테더링 케이블', 'COMPUTER', 10),
  ('블랙 테더링 케이블 50cm', 'COMPUTER', 11),
  ('HDMI 케이블', 'COMPUTER', 12),
  ('안경 4종', 'ETC', 1),
  ('넥타이 3종', 'ETC', 2),
  ('앞치마 4종', 'ETC', 3),
  ('판넬 / 보드판', 'ETC', 4);

notify pgrst, 'reload schema';
