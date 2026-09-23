-- 모바일 사진 작업 목록의 표시 상태는 파이프라인 status와 분리한다.
-- 완료/보류는 프로젝트 행이나 NAS 파일을 삭제하지 않는다.

alter table public.photo_storage_projects
  add column if not exists notification_deferred_until timestamptz,
  add column if not exists notification_dismissed_at timestamptz;

-- 관리자 대기 목록은 미완료 알림만 시간순으로 읽는다.
create index if not exists photo_storage_projects_actionable_notification_idx
  on public.photo_storage_projects (status, notification_deferred_until, updated_at desc)
  where notification_dismissed_at is null
    and status in (
      'READY', 'DEFERRED', 'MERGE_COMPLETED', 'REVIEW_REQUIRED',
      'ERROR', 'MERGE_FAILED', 'COPY_FAILED', 'CLASSIFY_FAILED'
    );
