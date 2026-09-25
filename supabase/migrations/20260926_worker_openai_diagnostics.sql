-- Report whether the Mac Studio Worker can run Scene AI before a photo job starts.
-- The secret itself is never sent or stored.

alter table public.remote_workers
  add column if not exists openai_api_key_configured boolean;
