create table if not exists public.remote_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  target_worker text not null default 'jake-macstudio-01',
  status text not null default 'QUEUED',
  result jsonb,
  message text,
  error text,
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint remote_jobs_status_check
    check (status in ('QUEUED','RUNNING','COMPLETED','FAILED'))
);

create index if not exists remote_jobs_queue_idx
  on public.remote_jobs (target_worker, status, created_at);

alter table public.remote_jobs enable row level security;

create or replace function public.claim_remote_job(p_worker_id text)
returns table (
  job_id uuid,
  action text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select id
    from public.remote_jobs
    where status = 'QUEUED'
      and target_worker = p_worker_id
    order by created_at asc
    for update skip locked
    limit 1
  ),
  claimed as (
    update public.remote_jobs r
    set
      status = 'RUNNING',
      claimed_at = now(),
      started_at = coalesce(r.started_at, now()),
      updated_at = now()
    from candidate c
    where r.id = c.id
    returning r.id, r.action, r.payload
  )
  select
    claimed.id,
    claimed.action,
    claimed.payload
  from claimed;
end;
$$;

revoke all on function public.claim_remote_job(text) from public;
revoke all on function public.claim_remote_job(text) from anon;
revoke all on function public.claim_remote_job(text) from authenticated;
grant execute on function public.claim_remote_job(text) to service_role;
