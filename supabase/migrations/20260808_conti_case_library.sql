-- 콘티 사례 라이브러리 (1차): 과거 확정 콘티 PDF를 구조화 저장하고, 신규 콘티 생성 시
-- 유사 사례를 검색해 참고하도록 하는 RAG 사례 DB. 2차/3차(스타일 규칙 추출/승인, 수정 이력
-- 학습, 완료 시 자동 등록, 규칙 자동 제안)는 포함하지 않는다.
-- 임베딩 모델/차원은 lib/conti-library/config.ts 의 EMBEDDING_MODEL/EMBEDDING_DIMENSIONS로
-- 관리한다. 현재 값: text-embedding-3-small, 1536차원. 모델을 바꾸면 이 마이그레이션도 갱신 필요.

create extension if not exists vector;

create table if not exists public.conti_case_documents (
  id             uuid primary key default gen_random_uuid(),
  file_name      text not null,
  storage_path   text not null unique,
  file_hash      text not null unique,
  clinic_name    text,
  departments    text[] not null default '{}',
  shooting_type  text,
  doctor_count   int,
  scene_count    int not null default 0,
  status         text not null default 'uploaded'
                   check (status in ('uploaded', 'analyzing', 'analyzed', 'failed')),
  metadata       jsonb not null default '{}'::jsonb,
  embedding      vector(1536),
  error_message  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.conti_case_scenes (
  id                uuid primary key default gen_random_uuid(),
  case_document_id  uuid not null references public.conti_case_documents(id) on delete cascade,
  scene_order       int not null default 0,
  scene_name        text not null default '',
  scene_type        text not null default 'etc'
                       check (scene_type in (
                         'profile','consultation','procedure','equipment','staff','patient',
                         'interior','exterior','reception','waiting','treatment_room',
                         'operating_room','detail','branding','group','etc'
                       )),
  department        text,
  subjects          jsonb not null default '[]'::jsonb,
  location          text,
  action            text,
  camera_angle      text,
  shot_size         text,
  pose              text,
  props             jsonb not null default '[]'::jsonb,
  equipment         jsonb not null default '[]'::jsonb,
  direction         text,
  notes             text,
  raw_text          text,
  metadata          jsonb not null default '{}'::jsonb,
  embedding         vector(1536),
  created_at        timestamptz not null default now()
);

create index if not exists idx_conti_case_documents_status on public.conti_case_documents(status);
create index if not exists idx_conti_case_documents_departments on public.conti_case_documents using gin(departments);
create index if not exists idx_conti_case_scenes_document on public.conti_case_scenes(case_document_id, scene_order);
create index if not exists idx_conti_case_scenes_department on public.conti_case_scenes(department);
create index if not exists idx_conti_case_documents_embedding on public.conti_case_documents using hnsw (embedding vector_cosine_ops);
create index if not exists idx_conti_case_scenes_embedding on public.conti_case_scenes using hnsw (embedding vector_cosine_ops);

create or replace function public.match_conti_case_scenes(
  query_embedding    vector(1536),
  department_filter  text[] default null,
  match_count        int default 8
)
returns table (
  id uuid, case_document_id uuid, scene_name text, scene_type text, department text,
  location text, action text, camera_angle text, direction text, notes text,
  clinic_name text, file_name text, similarity float
)
language sql stable as $$
  select
    s.id, s.case_document_id, s.scene_name, s.scene_type, s.department,
    s.location, s.action, s.camera_angle, s.direction, s.notes,
    d.clinic_name, d.file_name,
    1 - (s.embedding <=> query_embedding) as similarity
  from public.conti_case_scenes s
  join public.conti_case_documents d on d.id = s.case_document_id
  where s.embedding is not null
    and d.status = 'analyzed'
    and (department_filter is null or s.department = any(department_filter))
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_conti_case_documents(
  query_embedding    vector(1536),
  department_filter  text[] default null,
  match_count        int default 5
)
returns table (
  id uuid, file_name text, clinic_name text, departments text[], shooting_type text,
  scene_count int, similarity float
)
language sql stable as $$
  select
    d.id, d.file_name, d.clinic_name, d.departments, d.shooting_type, d.scene_count,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.conti_case_documents d
  where d.embedding is not null
    and d.status = 'analyzed'
    and (department_filter is null or d.departments && department_filter)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conti-case-library', 'conti-case-library', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.conti_case_documents enable row level security;
alter table public.conti_case_scenes enable row level security;

drop policy if exists "service role full access conti case documents" on public.conti_case_documents;
create policy "service role full access conti case documents" on public.conti_case_documents for all to service_role using (true) with check (true);
drop policy if exists "service role full access conti case scenes" on public.conti_case_scenes;
create policy "service role full access conti case scenes" on public.conti_case_scenes for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
