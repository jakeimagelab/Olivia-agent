-- Olivia OS 음성 기록 V1. 원본 오디오, 화자별 transcript, AI 파생 데이터를 분리 보존한다.

create table if not exists public.voice_recordings (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text not null default 'recording'
    check (status in ('recording', 'uploading', 'uploaded', 'diarizing', 'summarizing', 'completed', 'transcribed', 'error')),
  device_type text,
  mime_type text,
  audio_path text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  live_speaker_hints jsonb not null default '[]'::jsonb,
  transcript_text text,
  transcript_segments jsonb not null default '[]'::jsonb,
  speaker_names jsonb not null default '{}'::jsonb,
  summary text,
  key_points jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  recorded_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_recordings_recorded_at_idx
  on public.voice_recordings(recorded_at desc);
create index if not exists voice_recordings_status_recorded_at_idx
  on public.voice_recordings(status, recorded_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists voice_recordings_updated_at on public.voice_recordings;
create trigger voice_recordings_updated_at
  before update on public.voice_recordings
  for each row execute procedure public.set_updated_at();

alter table public.voice_recordings enable row level security;
drop policy if exists "service role voice recordings" on public.voice_recordings;
create policy "service role voice recordings"
  on public.voice_recordings for all to service_role
  using (true) with check (true);

revoke all on table public.voice_recordings from anon, authenticated;
grant all on table public.voice_recordings to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-recordings',
  'voice-recordings',
  false,
  -- 현재 OpenAI diarization 처리 한도와 Supabase 프로젝트 업로드 상한에 맞춘다.
  -- 장시간 녹음 chunk 업로드를 도입할 때 함께 상향한다.
  26214400,
  array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
