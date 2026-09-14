-- Olivia Photo Storage PHASE 4 — SSD1 JPG원본 → SSD2 staging

alter table public.photo_storage_projects
  drop constraint if exists photo_storage_projects_status_check;

alter table public.photo_storage_projects
  add constraint photo_storage_projects_status_check
  check (status in (
    'READY', 'APPROVED', 'DEFERRED', 'REVIEW_REQUIRED', 'ERROR',
    'COPY_QUEUED', 'COPYING', 'COPY_VERIFYING', 'COPY_COMPLETED', 'COPY_FAILED'
  ));

alter table public.photo_storage_projects
  add column if not exists work_relative_path text,
  add column if not exists copy_started_at timestamptz,
  add column if not exists copy_completed_at timestamptz,
  add column if not exists copied_jpg_count integer not null default 0,
  add column if not exists copied_jpg_bytes bigint not null default 0,
  add column if not exists copy_error text,
  add column if not exists copy_progress jsonb not null default '{}'::jsonb,
  add column if not exists copy_job_id uuid;

alter table public.photo_storage_events
  drop constraint if exists photo_storage_events_event_type_check;

alter table public.photo_storage_events
  add constraint photo_storage_events_event_type_check
  check (event_type in (
    'PHOTO_PROJECT_READY',
    'PHOTO_PROJECT_APPROVED',
    'PHOTO_PROJECT_DEFERRED',
    'PHOTO_PROJECT_REVIEW_REQUIRED',
    'PHOTO_PROJECT_ERROR',
    'PHOTO_COPY_STARTED',
    'PHOTO_COPY_COMPLETED',
    'PHOTO_COPY_FAILED'
  ));

create index if not exists photo_storage_projects_copy_status_idx
  on public.photo_storage_projects (status, updated_at desc);

-- 같은 프로젝트의 active staging job은 하나만 허용한다.
create unique index if not exists remote_jobs_photo_stage_active_unique_idx
  on public.remote_jobs ((payload->>'project_id'))
  where action = 'PHOTO_STAGE_JPG' and status in ('QUEUED', 'RUNNING');

-- Worker가 승인된 프로젝트를 하나씩 claim해 remote_jobs로 넘긴다.
create or replace function public.claim_approved_photo_project(p_worker_id text)
returns table (project_id uuid, job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select p.id
    from public.photo_storage_projects p
    where (
      p.status = 'APPROVED'
      or (
        p.status in ('COPY_QUEUED', 'COPYING', 'COPY_VERIFYING')
        and p.updated_at < now() - interval '30 seconds'
      )
    )
      and not exists (
        select 1
        from public.remote_jobs j
        where j.action = 'PHOTO_STAGE_JPG'
          and j.payload->>'project_id' = p.id::text
          and j.status in ('QUEUED', 'RUNNING')
      )
    order by p.approved_at nulls first, p.updated_at asc
    for update skip locked
    limit 1
  ), queued as (
    update public.photo_storage_projects p
    set status = 'COPY_QUEUED',
        work_relative_path = p.source_relative_path,
        copy_error = null,
        copy_progress = '{}'::jsonb,
        updated_at = now()
    from candidate c
    where p.id = c.id
    returning p.id, p.source_relative_path
  ), inserted as (
    insert into public.remote_jobs (action, payload, target_worker, status)
    select
      'PHOTO_STAGE_JPG',
      jsonb_build_object(
        'project_id', q.id,
        'source_relative_path', q.source_relative_path,
        'destination_relative_path', q.source_relative_path
      ),
      p_worker_id,
      'QUEUED'
    from queued q
    returning id, (payload->>'project_id')::uuid as project_id
  ), linked as (
    update public.photo_storage_projects p
    set copy_job_id = i.id,
        updated_at = now()
    from inserted i
    where p.id = i.project_id
    returning p.id as project_id, i.id as job_id
  )
  select linked.project_id, linked.job_id from linked;
end;
$$;

revoke all on function public.claim_approved_photo_project(text) from public;
revoke all on function public.claim_approved_photo_project(text) from anon;
revoke all on function public.claim_approved_photo_project(text) from authenticated;
grant execute on function public.claim_approved_photo_project(text) to service_role;
