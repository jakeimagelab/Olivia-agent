-- Olivia Voice Brand Interview System V1.
-- 일반 voice_recordings는 유지하고, 인터뷰 준비와 immutable Snapshot을 별도 엔터티로 둔다.

create table if not exists public.voice_interview_preparations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid null references public.clients(id) on delete set null,
  workflow_run_id uuid null references public.workflow_runs(id) on delete set null,
  hospital_name text not null,
  interviewee_name text not null,
  interview_date date null,
  template_key text not null,
  template_version integer not null,
  selected_questions jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'recording', 'completed', 'canceled')),
  revision integer not null default 0,
  current_version_id uuid null,
  recording_id uuid null references public.voice_recordings(id) on delete set null,
  ready_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz null,
  completed_at timestamptz null
);

create table if not exists public.voice_interview_preparation_versions (
  id uuid primary key default gen_random_uuid(),
  preparation_id uuid not null references public.voice_interview_preparations(id) on delete cascade,
  version_no integer not null,
  hospital_name text not null,
  interviewee_name text not null,
  interview_date date null,
  template_key text not null,
  template_version integer not null,
  selected_questions jsonb not null default '[]'::jsonb,
  pdf_storage_path text null,
  pdf_created_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (preparation_id, version_no)
);

alter table public.voice_interview_preparations
  drop constraint if exists voice_interview_preparations_current_version_id_fkey;
alter table public.voice_interview_preparations
  add constraint voice_interview_preparations_current_version_id_fkey
  foreign key (current_version_id) references public.voice_interview_preparation_versions(id)
  on delete set null;

create index if not exists voice_interview_preparations_client_id_idx
  on public.voice_interview_preparations(client_id);
create index if not exists voice_interview_preparations_workflow_run_id_idx
  on public.voice_interview_preparations(workflow_run_id);
create index if not exists voice_interview_preparations_status_idx
  on public.voice_interview_preparations(status);
create index if not exists voice_interview_preparations_interview_date_idx
  on public.voice_interview_preparations(interview_date);
create index if not exists voice_interview_preparation_versions_preparation_id_idx
  on public.voice_interview_preparation_versions(preparation_id, version_no desc);

alter table public.voice_recordings
  add column if not exists recording_mode text not null default 'general'
    check (recording_mode in ('general', 'interview')),
  add column if not exists interview_preparation_id uuid null references public.voice_interview_preparations(id) on delete set null,
  add column if not exists interview_version_id uuid null references public.voice_interview_preparation_versions(id) on delete set null,
  add column if not exists client_id uuid null references public.clients(id) on delete set null,
  add column if not exists workflow_run_id uuid null references public.workflow_runs(id) on delete set null,
  add column if not exists interviewee_name text null,
  add column if not exists selected_questions jsonb not null default '[]'::jsonb,
  add column if not exists question_markers jsonb not null default '[]'::jsonb,
  add column if not exists highlight_markers jsonb not null default '[]'::jsonb,
  add column if not exists field_notes jsonb not null default '[]'::jsonb,
  add column if not exists interview_result jsonb null,
  add column if not exists finalized_at timestamptz null,
  add column if not exists audio_status text null
    check (audio_status is null or audio_status in ('recording', 'uploading', 'stored', 'incomplete')),
  add column if not exists analysis_status text null
    check (analysis_status is null or analysis_status in ('pending', 'transcribing', 'summarizing', 'completed', 'failed'));

create index if not exists voice_recordings_interview_preparation_idx
  on public.voice_recordings(interview_preparation_id, recorded_at desc)
  where recording_mode = 'interview';

create table if not exists public.voice_recording_chunks (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.voice_recordings(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null check (end_seconds >= start_seconds),
  status text not null check (status in ('uploading', 'uploaded', 'failed')),
  checksum text null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz null,
  unique (recording_id, sequence)
);

create index if not exists voice_recording_chunks_recording_sequence_idx
  on public.voice_recording_chunks(recording_id, sequence);

create table if not exists public.voice_recording_events (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.voice_recordings(id) on delete cascade,
  event_id text not null,
  event_type text not null check (event_type in ('question_started', 'highlight', 'follow_up', 'field_note')),
  at_seconds numeric not null check (at_seconds >= 0),
  question_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (recording_id, event_id)
);

create index if not exists voice_recording_events_recording_time_idx
  on public.voice_recording_events(recording_id, at_seconds);

alter table public.voice_interview_preparations enable row level security;
alter table public.voice_interview_preparation_versions enable row level security;
alter table public.voice_recording_chunks enable row level security;
alter table public.voice_recording_events enable row level security;

drop policy if exists "service role voice interview preparations" on public.voice_interview_preparations;
create policy "service role voice interview preparations" on public.voice_interview_preparations
  for all to service_role using (true) with check (true);
drop policy if exists "service role voice interview preparation versions" on public.voice_interview_preparation_versions;
create policy "service role voice interview preparation versions" on public.voice_interview_preparation_versions
  for all to service_role using (true) with check (true);
drop policy if exists "service role voice recording chunks" on public.voice_recording_chunks;
create policy "service role voice recording chunks" on public.voice_recording_chunks
  for all to service_role using (true) with check (true);
drop policy if exists "service role voice recording events" on public.voice_recording_events;
create policy "service role voice recording events" on public.voice_recording_events
  for all to service_role using (true) with check (true);

revoke all on public.voice_interview_preparations from anon, authenticated;
revoke all on public.voice_interview_preparation_versions from anon, authenticated;
revoke all on public.voice_recording_chunks from anon, authenticated;
revoke all on public.voice_recording_events from anon, authenticated;
grant all on public.voice_interview_preparations to service_role;
grant all on public.voice_interview_preparation_versions to service_role;
grant all on public.voice_recording_chunks to service_role;
grant all on public.voice_recording_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-interview-documents', 'voice-interview-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
