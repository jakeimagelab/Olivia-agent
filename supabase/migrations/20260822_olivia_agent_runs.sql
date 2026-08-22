-- Olivia persistent Agent Run orchestration. Additive and safe to re-run.
create table if not exists public.olivia_agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  conversation_id uuid null references public.assistant_conversations(id) on delete set null,
  client_id uuid null references public.clients(id) on delete set null,
  workflow_run_id uuid null references public.workflow_runs(id) on delete set null,
  source text not null default 'chat',
  goal text not null,
  run_type text not null default 'general',
  status text not null default 'queued' check (status in ('queued','planning','running','waiting_approval','paused','completed','failed','canceled')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_step_key text null,
  result_summary text not null default '',
  error_message text not null default '',
  idempotency_key text not null unique,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  lease_owner text null,
  lease_expires_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.olivia_agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.olivia_agent_runs(id) on delete cascade,
  step_key text not null,
  order_index integer not null,
  title text not null,
  tool_name text null,
  status text not null default 'pending' check (status in ('pending','running','waiting_approval','completed','failed','skipped','canceled')),
  input_data jsonb not null default '{}'::jsonb,
  output_data jsonb not null default '{}'::jsonb,
  approval_id uuid null references public.agent_approvals(id) on delete set null,
  error_message text not null default '',
  attempt_count integer not null default 0,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, step_key)
);

create table if not exists public.olivia_agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.olivia_agent_runs(id) on delete cascade,
  event_type text not null,
  message text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists olivia_agent_runs_status_updated_idx on public.olivia_agent_runs(status, updated_at desc);
create index if not exists olivia_agent_runs_client_status_idx on public.olivia_agent_runs(client_id, status);
create index if not exists olivia_agent_runs_workflow_status_idx on public.olivia_agent_runs(workflow_run_id, status);
create index if not exists olivia_agent_run_steps_order_idx on public.olivia_agent_run_steps(run_id, order_index);
create index if not exists olivia_agent_run_events_created_idx on public.olivia_agent_run_events(run_id, created_at desc);

alter table public.olivia_agent_runs enable row level security;
alter table public.olivia_agent_run_steps enable row level security;
alter table public.olivia_agent_run_events enable row level security;

drop policy if exists "service role full access olivia agent runs" on public.olivia_agent_runs;
create policy "service role full access olivia agent runs" on public.olivia_agent_runs for all to service_role using (true) with check (true);
drop policy if exists "service role full access olivia agent run steps" on public.olivia_agent_run_steps;
create policy "service role full access olivia agent run steps" on public.olivia_agent_run_steps for all to service_role using (true) with check (true);
drop policy if exists "service role full access olivia agent run events" on public.olivia_agent_run_events;
create policy "service role full access olivia agent run events" on public.olivia_agent_run_events for all to service_role using (true) with check (true);

grant all on table public.olivia_agent_runs, public.olivia_agent_run_steps, public.olivia_agent_run_events to service_role;

create or replace function public.claim_olivia_agent_runs(worker_id text, batch_size integer default 3, lease_seconds integer default 60)
returns setof public.olivia_agent_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id from public.olivia_agent_runs
    where status = 'queued'
       or (status in ('planning','running') and (lease_expires_at is null or lease_expires_at < now()))
    order by created_at
    for update skip locked
    limit greatest(1, least(batch_size, 10))
  )
  update public.olivia_agent_runs run
  set lease_owner = worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(15, least(lease_seconds, 300))),
      updated_at = now()
  from candidates
  where run.id = candidates.id
  returning run.*;
end;
$$;
revoke all on function public.claim_olivia_agent_runs(text, integer, integer) from public;
grant execute on function public.claim_olivia_agent_runs(text, integer, integer) to service_role;
notify pgrst, 'reload schema';
