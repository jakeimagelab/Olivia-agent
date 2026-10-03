-- Browser capture remains readable for old records. New audio is an unmodified
-- iPhone/Files import, with source metadata kept separately from AI output.
alter table public.voice_recordings
  add column if not exists source_metadata jsonb null;

-- Original recordings may be longer than one OpenAI transcription request.
-- They remain private and can be retained even if AI processing later needs a
-- server-side split worker. The application still enforces the 25MB AI limit.
update storage.buckets
  set file_size_limit = 536870912,
      allowed_mime_types = array[
        'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm',
        'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'
      ]
  where id = 'voice-recordings';
