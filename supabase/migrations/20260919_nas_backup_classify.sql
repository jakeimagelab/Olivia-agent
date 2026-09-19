-- Olivia OS 2.0 — 작업 D: NAS 감지기 단일화. nas-backup-watcher(BACKUP_READY)에서 승인된
-- 폴더를 PHASE 6 파이프라인(claim_copy_completed_photo_project와 동일한 마지막 단계)으로
-- 연결하되, department/shooting_mode를 절대 추측하지 않는다(nas_backup_start_sort의 기존
-- 규칙, 건드리지 말 것 목록). 기존 claim_copy_completed_photo_project(카메라 임포트 경로,
-- dermatology/field 하드코딩, OLIVIA_ENABLE_PHOTO_CLASSIFICATION_AUTOMATION 게이트)는 이
-- migration에서 단 한 줄도 바꾸지 않는다 — 완전히 별도의 NAS 전용 컬럼 + RPC를 추가한다.

alter table public.photo_storage_projects
  add column if not exists nas_department text,
  add column if not exists nas_shooting_mode text check (nas_shooting_mode in ('field', 'studio'));

-- NAS 경로로 승인된(=이미 사람이 department/shooting_mode를 명시적으로 입력한) 프로젝트를
-- COPY_COMPLETED에서 CLASSIFY_QUEUED로 claim한다. claim_copy_completed_photo_project와 로직은
-- 동일하지만 대상을 nas_department is not null인 row로 한정하고, 하드코딩 대신 그 값을 그대로
-- 쓰며, OLIVIA_ENABLE_PHOTO_CLASSIFICATION_AUTOMATION 플래그와 무관하게 항상 동작한다 — NAS
-- 분류는 "분류 시작"을 사람이 눌러야만 photo_storage_projects row가 만들어지므로 이미 명시적
-- 승인이 끝난 상태다.
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

revoke all on function public.claim_nas_classify_photo_project(text) from public;
revoke all on function public.claim_nas_classify_photo_project(text) from anon;
revoke all on function public.claim_nas_classify_photo_project(text) from authenticated;
grant execute on function public.claim_nas_classify_photo_project(text) to service_role;
