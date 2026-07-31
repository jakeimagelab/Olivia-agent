-- 초상권 동의서 (콘티/초상권 작성) — 촬영 모델/환자로부터 초상권 사용 동의를 받는 문서.
-- 파일로 전달하지 않고, 토큰 기반 포털 링크로 제공자가 직접 서명하며,
-- 서명 결과는 이 테이블에 저장된다(다운로드 파일이 아닌 DB 저장이 원본).
-- 원본 토큰은 저장하지 않고 해시값만 저장한다(hospital_brand_diagnosis_shares와 동일한 방식).

create table if not exists public.portrait_consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,

  title text not null default '초상권 동의서',
  intro_text text not null default '본 동의서는, 포토클리닉에서 홍보영상/사진 제작에 필요한 인물촬영(사진/영상)에 대한 초상권 내용입니다. (본 목적 외에 다른 용도로는 사용이 불가)',
  detail_fields jsonb not null default '[]'::jsonb,
  usage_items jsonb not null default '[]'::jsonb,

  consent_shoot boolean,
  consent_usage boolean,
  provider_name text,
  signature_data_url text,
  signed_date text,

  status text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  signed_at timestamptz,

  token_hash text unique,
  token_expires_at timestamptz,
  token_revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,

  created_by text default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portrait_consents_client_id
  on public.portrait_consents(client_id);
create index if not exists idx_portrait_consents_workflow_run_id
  on public.portrait_consents(workflow_run_id);
create index if not exists idx_portrait_consents_token_hash
  on public.portrait_consents(token_hash);
create index if not exists idx_portrait_consents_created_at
  on public.portrait_consents(created_at desc);

drop trigger if exists portrait_consents_updated_at on public.portrait_consents;
create trigger portrait_consents_updated_at
  before update on public.portrait_consents
  for each row execute procedure public.set_updated_at();

alter table public.portrait_consents enable row level security;

drop policy if exists "service role portrait_consents" on public.portrait_consents;
create policy "service role portrait_consents"
  on public.portrait_consents for all to service_role
  using (true) with check (true);

grant all on table public.portrait_consents to service_role;

notify pgrst, 'reload schema';
