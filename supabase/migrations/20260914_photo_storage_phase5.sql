-- Olivia Photo Storage PHASE 5 — SSD2 staged JPG → existing Scene runner

alter table public.photo_storage_projects
  drop constraint if exists photo_storage_projects_status_check;

alter table public.photo_storage_projects
  add constraint photo_storage_projects_status_check
  check (status in (
    'READY', 'APPROVED', 'DEFERRED', 'REVIEW_REQUIRED', 'ERROR',
    'COPY_QUEUED', 'COPYING', 'COPY_VERIFYING', 'COPY_COMPLETED', 'COPY_FAILED',
    'CLASSIFY_QUEUED', 'CLASSIFYING', 'CLASSIFY_VERIFYING', 'CLASSIFY_COMPLETED', 'CLASSIFY_FAILED'
  ));

alter table public.photo_storage_projects
  add column if not exists scene_count integer not null default 0,
  add column if not exists classified_jpg_count integer not null default 0,
  add column if not exists classification_started_at timestamptz,
  add column if not exists classification_completed_at timestamptz,
  add column if not exists classification_error text,
  add column if not exists classification_progress jsonb not null default '{}'::jsonb,
  add column if not exists classify_job_id uuid;

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
    'PHOTO_COPY_FAILED',
    'PHOTO_CLASSIFICATION_STARTED',
    'PHOTO_CLASSIFICATION_COMPLETED',
    'PHOTO_CLASSIFICATION_FAILED'
  ));

create index if not exists photo_storage_projects_classification_status_idx
  on public.photo_storage_projects (status, updated_at desc);

-- 같은 프로젝트의 active Scene 분류 job은 하나만 허용한다.
create unique index if not exists remote_jobs_photo_classify_active_unique_idx
  on public.remote_jobs ((payload->>'project_id'))
  where action = 'PHOTO_CLASSIFY_WORK' and status in ('QUEUED', 'RUNNING');

-- COPY_COMPLETED 프로젝트를 Worker가 원자적으로 claim해 분류 job으로 넘긴다.
create or replace function public.claim_copy_completed_photo_project(p_worker_id text)
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
    where p.work_relative_path is not null
      and (
        p.status = 'COPY_COMPLETED'
        or (
          p.status in ('CLASSIFY_QUEUED', 'CLASSIFYING', 'CLASSIFY_VERIFYING')
          and p.updated_at < now() - interval '30 seconds'
        )
      )
      and not exists (
        select 1
        from public.remote_jobs j
        where j.action = 'PHOTO_CLASSIFY_WORK'
          and j.payload->>'project_id' = p.id::text
          and j.status in ('QUEUED', 'RUNNING')
      )
    order by p.copy_completed_at nulls first, p.updated_at asc
    for update skip locked
    limit 1
  ), queued as (
    update public.photo_storage_projects p
    set status = 'CLASSIFY_QUEUED',
        classification_error = null,
        classification_progress = '{}'::jsonb,
        classification_started_at = null,
        classification_completed_at = null,
        classified_jpg_count = 0,
        scene_count = 0,
        updated_at = now()
    from candidate c
    where p.id = c.id
    returning p.id, p.work_relative_path
  ), inserted as (
    insert into public.remote_jobs (action, payload, target_worker, status)
    select
      'PHOTO_CLASSIFY_WORK',
      jsonb_build_object(
        'project_id', q.id,
        'work_relative_path', q.work_relative_path,
        'expected_jpg_count', p.jpg_count,
        'expected_jpg_bytes', p.jpg_bytes,
        'shooting_mode', 'field',
        'department', 'dermatology',
        'gap_minutes', 3.5,
        'classification_ui_mode', 'ai-auto',
        'fast_analyze_mode', false,
        'department_logic_enabled', true,
        'ai_naming_enabled', false,
        'quality_analysis_enabled', false,
        'profile_classification_enabled', true
      ),
      p_worker_id,
      'QUEUED'
    from queued q
    join public.photo_storage_projects p on p.id = q.id
    returning id, (payload->>'project_id')::uuid as project_id
  ), linked as (
    update public.photo_storage_projects p
    set classify_job_id = i.id,
        updated_at = now()
    from inserted i
    where p.id = i.project_id
    returning p.id as project_id, i.id as job_id
  )
  select linked.project_id, linked.job_id from linked;
end;
$$;

revoke all on function public.claim_copy_completed_photo_project(text) from public;
revoke all on function public.claim_copy_completed_photo_project(text) from anon;
revoke all on function public.claim_copy_completed_photo_project(text) from authenticated;
grant execute on function public.claim_copy_completed_photo_project(text) to service_role;
