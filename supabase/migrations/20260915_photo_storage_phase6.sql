-- Olivia Photo Storage PHASE 6 — 1차(JPG 통합) / 2차(복사+분류) 승인 게이트 분리

-- 기존 APPROVED row를 먼저 CLASSIFY_APPROVED로 이관한 뒤 제약을 건다.
alter table public.photo_storage_projects
  drop constraint if exists photo_storage_projects_status_check;

update public.photo_storage_projects
  set status = 'CLASSIFY_APPROVED'
  where status = 'APPROVED';

alter table public.photo_storage_projects
  add constraint photo_storage_projects_status_check
  check (status in (
    'READY', 'DEFERRED', 'REVIEW_REQUIRED', 'ERROR',
    'MERGE_APPROVED', 'MERGING', 'MERGE_COMPLETED', 'MERGE_FAILED',
    'CLASSIFY_APPROVED',
    'COPY_QUEUED', 'COPYING', 'COPY_VERIFYING', 'COPY_COMPLETED', 'COPY_FAILED',
    'CLASSIFY_QUEUED', 'CLASSIFYING', 'CLASSIFY_VERIFYING', 'CLASSIFY_COMPLETED', 'CLASSIFY_FAILED'
  ));

alter table public.photo_storage_projects
  add column if not exists merge_job_id uuid,
  add column if not exists merge_started_at timestamptz,
  add column if not exists merge_completed_at timestamptz,
  add column if not exists merged_jpg_count integer not null default 0,
  add column if not exists merge_conflict_count integer not null default 0,
  add column if not exists raw_untouched_count integer not null default 0,
  add column if not exists merge_error text,
  add column if not exists merge_progress jsonb not null default '{}'::jsonb,
  add column if not exists merge_approved_at timestamptz,
  add column if not exists classify_approved_at timestamptz;

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
    'PHOTO_CLASSIFICATION_FAILED',
    'PHOTO_MERGE_STARTED',
    'PHOTO_MERGE_COMPLETED',
    'PHOTO_MERGE_FAILED',
    'PHOTO_PROJECT_CLASSIFY_APPROVED'
  ));

-- 같은 프로젝트의 active JPG 통합(1차 승인) job은 하나만 허용한다.
create unique index if not exists remote_jobs_photo_prepare_active_unique_idx
  on public.remote_jobs ((payload->>'project_id'))
  where action = 'PHOTO_PREPARE_SOURCE' and status in ('QUEUED', 'RUNNING');

-- 1차 승인(JPG 통합) 프로젝트를 Worker가 하나씩 claim해 remote_jobs로 넘긴다.
create or replace function public.claim_merge_approved_photo_project(p_worker_id text)
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
      p.status = 'MERGE_APPROVED'
      or (
        p.status = 'MERGING'
        and p.updated_at < now() - interval '30 seconds'
      )
    )
      and not exists (
        select 1
        from public.remote_jobs j
        where j.action = 'PHOTO_PREPARE_SOURCE'
          and j.payload->>'project_id' = p.id::text
          and j.status in ('QUEUED', 'RUNNING')
      )
    order by p.merge_approved_at nulls first, p.updated_at asc
    for update skip locked
    limit 1
  ), queued as (
    update public.photo_storage_projects p
    set status = 'MERGING',
        merge_error = null,
        merge_progress = '{}'::jsonb,
        merge_started_at = null,
        merge_completed_at = null,
        merged_jpg_count = 0,
        merge_conflict_count = 0,
        raw_untouched_count = 0,
        updated_at = now()
    from candidate c
    where p.id = c.id
    returning p.id, p.source_relative_path
  ), inserted as (
    insert into public.remote_jobs (action, payload, target_worker, status)
    select
      'PHOTO_PREPARE_SOURCE',
      jsonb_build_object(
        'project_id', q.id,
        'source_relative_path', q.source_relative_path
      ),
      p_worker_id,
      'QUEUED'
    from queued q
    returning id, (payload->>'project_id')::uuid as project_id
  ), linked as (
    update public.photo_storage_projects p
    set merge_job_id = i.id,
        updated_at = now()
    from inserted i
    where p.id = i.project_id
    returning p.id as project_id, i.id as job_id
  )
  select linked.project_id, linked.job_id from linked;
end;
$$;

revoke all on function public.claim_merge_approved_photo_project(text) from public;
revoke all on function public.claim_merge_approved_photo_project(text) from anon;
revoke all on function public.claim_merge_approved_photo_project(text) from authenticated;
grant execute on function public.claim_merge_approved_photo_project(text) to service_role;

-- 2차 승인(복사) 대상 상태를 APPROVED -> CLASSIFY_APPROVED로 변경한다.
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
      p.status = 'CLASSIFY_APPROVED'
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

-- gap_minutes는 precise 모드에서 무시되는 값이므로 payload에서 제거한다.
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
