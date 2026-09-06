-- Olivia AI 콘티 자동생성 시스템 — 데이터 모델 (1단계)
-- 결정론적 매칭(scene_templates + hospital_spaces/staff)으로 장면을 조립하고,
-- AI는 판단 못 하는 칸만 채운다. 각 필드가 어디서 왔는지(template/hospital/ai/user/blank)를
-- field_sources에 기록해 결과 표에서 출처별로 구분해 보여준다.
--
-- 기존 conti_saves(및 그 안의 ContiResult jsonb)는 삭제하지 않는다. 공유뷰
-- (app/conti/view/[token]), Olivia 에이전트 도구(lib/olivia/v2/toolExecutors/conti.ts),
-- contiMutationService.ts가 계속 이 테이블을 읽고 쓴다. conti_runs.legacy_save_id로
-- 신규 스키마와 연결해 두고, 별도 백필 스크립트(2단계)로 과거 저장 콘티를
-- conti_runs/conti_groups/conti_scenes에 채워 넣는다.

-- ── 시스템 자산: 장면 템플릿 ─────────────────────────────────
create table if not exists public.scene_templates (
  id                   uuid primary key default gen_random_uuid(),
  specialty            text not null,          -- 피부과 / 정형외과 계열 ...
  category             text not null,          -- 대분류: 리프팅, 주사치료 ...
  scene_key            text not null,          -- 리프팅_시술
  default_name         text default '',
  default_keyword      text default '',        -- "전문적이고 집중하는 장면"
  default_description  text default '',
  default_minutes      int,
  space_type           text default '',        -- 일반명: 시술실, 로비, 진료실
  default_roles        text[] not null default '{}',  -- [원장, 환자, 간호사]
  needs_patient        boolean not null default false,
  per_doctor           boolean not null default false, -- true면 의료진 수만큼 복제
  usage_count          int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (specialty, scene_key)
);

create index if not exists scene_templates_specialty_category_idx
  on public.scene_templates(specialty, category);

-- ── 병원 프로필 (고객관리에 연결) ────────────────────────────
create table if not exists public.hospital_spaces (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.clients(id) on delete cascade,
  name         text not null,        -- "2층 외래 로비"
  space_type   text not null,        -- "로비"
  floor        text default '',      -- "2F" ← 그룹·동선의 기준
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists hospital_spaces_hospital_idx on public.hospital_spaces(hospital_id, sort);
create index if not exists hospital_spaces_space_type_idx on public.hospital_spaces(hospital_id, space_type);

create table if not exists public.hospital_staff (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.clients(id) on delete cascade,
  name         text not null,        -- "김범준 원장님"
  role         text not null,        -- 원장 / 실장 / 간호사 / 직원
  specialty    text default '',
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists hospital_staff_hospital_idx on public.hospital_staff(hospital_id, sort);

-- ── 콘티 인스턴스 ────────────────────────────────────────────
create table if not exists public.conti_runs (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid references public.clients(id) on delete set null,
  legacy_save_id  uuid references public.conti_saves(id) on delete set null,
  specialty       text default '',
  doctor_count    int not null default 1,
  staff_flags     jsonb not null default '{}'::jsonb,   -- {siljang:true, jikwon:true, etc:"..."}
  harmony         boolean not null default false,
  checked         jsonb not null default '{}'::jsonb,   -- {리프팅:[울쎄라,써마지], 색소:[...]}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists conti_runs_hospital_idx on public.conti_runs(hospital_id, created_at desc);
create index if not exists conti_runs_legacy_save_idx on public.conti_runs(legacy_save_id);

create table if not exists public.conti_groups (
  id      uuid primary key default gen_random_uuid(),
  run_id  uuid not null references public.conti_runs(id) on delete cascade,
  name    text default '',   -- 공통 / 2F / 3F / 미지정
  color   text default '',
  sort    int not null default 0
);

create index if not exists conti_groups_run_idx on public.conti_groups(run_id, sort);

create table if not exists public.conti_scenes (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.conti_runs(id) on delete cascade,
  group_id           uuid references public.conti_groups(id) on delete set null,
  sort               int not null default 0,
  name               text default '',
  space_text         text default '',
  minutes            int,
  keyword            text default '',
  description        text default '',
  procedures         text[] not null default '{}',   -- 체크된 세부 시술
  people_text        text default '',
  patient_role_text  text default '',
  note               text default '',
  template_id        uuid references public.scene_templates(id) on delete set null,
  field_sources      jsonb not null default '{}'::jsonb,  -- {name:"template", space_text:"hospital", ...}
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists conti_scenes_run_idx on public.conti_scenes(run_id, sort);
create index if not exists conti_scenes_group_idx on public.conti_scenes(group_id, sort);
create index if not exists conti_scenes_template_idx on public.conti_scenes(template_id);

-- updated_at 트리거 (public.set_updated_at()는 setup-all.sql에서 이미 정의됨)
drop trigger if exists scene_templates_updated_at on public.scene_templates;
create trigger scene_templates_updated_at
  before update on public.scene_templates
  for each row execute procedure public.set_updated_at();

drop trigger if exists conti_runs_updated_at on public.conti_runs;
create trigger conti_runs_updated_at
  before update on public.conti_runs
  for each row execute procedure public.set_updated_at();

drop trigger if exists conti_scenes_updated_at on public.conti_scenes;
create trigger conti_scenes_updated_at
  before update on public.conti_scenes
  for each row execute procedure public.set_updated_at();

-- RLS
alter table public.scene_templates  enable row level security;
alter table public.hospital_spaces  enable row level security;
alter table public.hospital_staff   enable row level security;
alter table public.conti_runs       enable row level security;
alter table public.conti_groups     enable row level security;
alter table public.conti_scenes     enable row level security;

drop policy if exists "service role full access scene templates" on public.scene_templates;
create policy "service role full access scene templates" on public.scene_templates for all to service_role using (true) with check (true);
drop policy if exists "service role full access hospital spaces" on public.hospital_spaces;
create policy "service role full access hospital spaces" on public.hospital_spaces for all to service_role using (true) with check (true);
drop policy if exists "service role full access hospital staff" on public.hospital_staff;
create policy "service role full access hospital staff" on public.hospital_staff for all to service_role using (true) with check (true);
drop policy if exists "service role full access conti runs" on public.conti_runs;
create policy "service role full access conti runs" on public.conti_runs for all to service_role using (true) with check (true);
drop policy if exists "service role full access conti groups" on public.conti_groups;
create policy "service role full access conti groups" on public.conti_groups for all to service_role using (true) with check (true);
drop policy if exists "service role full access conti scenes" on public.conti_scenes;
create policy "service role full access conti scenes" on public.conti_scenes for all to service_role using (true) with check (true);

grant all on table public.scene_templates, public.hospital_spaces, public.hospital_staff,
  public.conti_runs, public.conti_groups, public.conti_scenes to service_role;

notify pgrst, 'reload schema';
