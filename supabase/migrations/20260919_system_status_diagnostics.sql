-- Olivia chat system diagnostics. Read-only UI/chat checks consume these worker signals.

alter table public.remote_workers
  add column if not exists workstation_mounted boolean,
  add column if not exists workstation_accessible boolean,
  add column if not exists agentstation_mounted boolean,
  add column if not exists agentstation_accessible boolean,
  add column if not exists watcher_last_scan_at timestamptz;

create table if not exists public.system_status_signals (
  signal_key text primary key,
  last_seen_at timestamptz not null,
  tool_count integer not null default 0 check (tool_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.system_status_signals enable row level security;

revoke all on table public.system_status_signals from anon, authenticated;

comment on table public.system_status_signals is
  'Non-secret Olivia connectivity signals such as the latest Hermes MCP ListTools request.';
