-- Enable the existing representative-frame Scene analyzer for future automatic
-- classification jobs. Queue locking, recovery conditions, and worker routing
-- remain identical to the previous functions.

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
        'ai_naming_enabled', true,
        'quality_analysis_enabled', false,
        'profile_classification_enabled', false
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

create or replace function public.claim_nas_classify_photo_project(p_worker_id text)
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
    where p.nas_department is not null
      and p.nas_shooting_mode is not null
      and p.work_relative_path is not null
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
    returning p.id, p.work_relative_path, p.nas_department, p.nas_shooting_mode
  ), inserted as (
    insert into public.remote_jobs (action, payload, target_worker, status)
    select
      'PHOTO_CLASSIFY_WORK',
      jsonb_build_object(
        'project_id', q.id,
        'work_relative_path', q.work_relative_path,
        'expected_jpg_count', p.jpg_count,
        'expected_jpg_bytes', p.jpg_bytes,
        'shooting_mode', q.nas_shooting_mode,
        'department', q.nas_department,
        'classification_ui_mode', 'ai-auto',
        'fast_analyze_mode', false,
        'department_logic_enabled', true,
        'ai_naming_enabled', true,
        'quality_analysis_enabled', false,
        'profile_classification_enabled', false
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

revoke all on function public.claim_nas_classify_photo_project(text) from public;
revoke all on function public.claim_nas_classify_photo_project(text) from anon;
revoke all on function public.claim_nas_classify_photo_project(text) from authenticated;
grant execute on function public.claim_nas_classify_photo_project(text) to service_role;
