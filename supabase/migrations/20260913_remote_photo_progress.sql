alter table public.remote_jobs
  add column if not exists progress jsonb not null default '{}'::jsonb;

create table if not exists public.remote_workers (
  worker_id text primary key,
  last_seen_at timestamptz not null default now(),
  worker_status text not null default 'online'
    check (worker_status in ('online', 'idle', 'busy', 'error')),
  nas_connected boolean,
  updated_at timestamptz not null default now()
);

alter table public.remote_workers enable row level security;

revoke all on table public.remote_workers from anon;
revoke all on table public.remote_workers from authenticated;
