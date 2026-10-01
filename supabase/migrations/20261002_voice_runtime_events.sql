-- Preserve the client-side order for markers made in the same millisecond and
-- distinguish a later recovery capture from the original recording epoch.
alter table public.voice_recording_events
  add column if not exists client_sequence integer not null default 0 check (client_sequence >= 0),
  add column if not exists audio_epoch_id text not null default 'legacy';

create index if not exists voice_recording_events_recording_timeline_idx
  on public.voice_recording_events(recording_id, at_seconds, client_sequence);

-- Requested capture settings and what the browser actually applied are both
-- retained with the original recording. This is metadata only; it never
-- changes the stored audio source or an AI-derived copy.
alter table public.voice_recordings
  add column if not exists capture_quality jsonb null;
