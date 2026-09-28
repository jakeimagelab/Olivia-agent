-- Olivia self-health engine. Findings are append-only across resolutions so an
-- incident keeps its history, while the partial unique index guarantees that
-- the same unresolved finding is updated instead of duplicated.

create table if not exists public.health_findings (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null,
  state text not null check (state in ('ok', 'issue', 'unknown')),
  detail text,
  remedy text,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (rule_id, resolved_at)
);

-- PostgreSQL considers NULL values distinct in a regular unique constraint.
-- This is the actual one-active-finding invariant.
create unique index if not exists health_findings_one_active_rule_idx
  on public.health_findings (rule_id)
  where resolved_at is null;

create index if not exists health_findings_active_idx
  on public.health_findings (last_seen_at desc)
  where resolved_at is null;

-- Long-window checks (such as 24-hour log growth) need a stable baseline.
-- Findings remain incident history; this table stores only bounded diagnostic
-- counters so a healthy check does not create a new finding every five minutes.
create table if not exists public.health_rule_metrics (
  rule_id text primary key,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.health_rule_metrics enable row level security;
revoke all on table public.health_rule_metrics from anon, authenticated;

alter table public.remote_workers
  add column if not exists worker_process_health jsonb;

comment on column public.remote_workers.worker_process_health is
  'Bounded OliviaWorker.app supervisor snapshot relayed by worker.sh; contains restart counts and log byte totals only.';

alter table public.health_findings enable row level security;
revoke all on table public.health_findings from anon, authenticated;
