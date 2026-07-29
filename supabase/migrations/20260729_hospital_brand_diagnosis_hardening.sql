-- 병원브랜드이미지 진단 보완 — 개선 항목 진행 상태, 팀원 공유 링크, soft delete를 위한
-- additive migration. 기존 테이블/컬럼은 삭제하거나 변경하지 않는다.

-- ── 1. 진단 테이블 보완 컬럼 ──────────────────────────────────────
alter table public.hospital_brand_diagnoses
  add column if not exists completed_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

create index if not exists idx_hbd_diagnoses_deleted_at
  on public.hospital_brand_diagnoses(deleted_at);

-- ── 2. 개선 항목 진행 상태 (섹션 15-2) ────────────────────────────
create table if not exists public.hospital_brand_diagnosis_actions (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  channel text
    check (channel is null or channel in ('website', 'naver_place', 'naver_blog', 'instagram', 'youtube', 'other')),
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'completed', 'deferred')),
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_hbd_actions_diagnosis_id
  on public.hospital_brand_diagnosis_actions(diagnosis_id);

drop trigger if exists hospital_brand_diagnosis_actions_updated_at on public.hospital_brand_diagnosis_actions;
create trigger hospital_brand_diagnosis_actions_updated_at
  before update on public.hospital_brand_diagnosis_actions
  for each row execute procedure public.set_updated_at();

-- ── 3. 팀원 공유 링크 (섹션 14) ────────────────────────────────────
-- 원본 토큰은 저장하지 않고 해시값만 저장한다 — 링크를 아는 사람만 조회할 수 있고,
-- DB가 유출되어도 토큰 자체는 복원할 수 없다.
create table if not exists public.hospital_brand_diagnosis_shares (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.hospital_brand_diagnoses(id) on delete cascade,
  token_hash text not null unique,
  recipient_email text default '',
  recipient_memo text default '',
  permission text not null default 'view' check (permission in ('view')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  created_by text default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists idx_hbd_shares_diagnosis_id
  on public.hospital_brand_diagnosis_shares(diagnosis_id);
create index if not exists idx_hbd_shares_token_hash
  on public.hospital_brand_diagnosis_shares(token_hash);

-- ── 4. RLS ────────────────────────────────────────────────────────
alter table public.hospital_brand_diagnosis_actions enable row level security;
alter table public.hospital_brand_diagnosis_shares enable row level security;

drop policy if exists "service role hbd actions" on public.hospital_brand_diagnosis_actions;
create policy "service role hbd actions"
  on public.hospital_brand_diagnosis_actions for all to service_role
  using (true) with check (true);

drop policy if exists "service role hbd shares" on public.hospital_brand_diagnosis_shares;
create policy "service role hbd shares"
  on public.hospital_brand_diagnosis_shares for all to service_role
  using (true) with check (true);

grant all on table public.hospital_brand_diagnosis_actions to service_role;
grant all on table public.hospital_brand_diagnosis_shares to service_role;

notify pgrst, 'reload schema';
