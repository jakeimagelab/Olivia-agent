-- 촬영 진행 팝업: 외부 원본 링크와 수동 단계 처리 이력을 기존 사진 프로젝트에 연결한다.
-- 별도 상태 머신은 만들지 않고, 링크는 기존 셀렉 갤러리, 수동 처리는 기존 이벤트 로그를 사용한다.

alter table public.select_galleries
  add column if not exists nas_link text;

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
    'PHOTO_PROJECT_CLASSIFY_APPROVED',
    'PHOTO_WORKFLOW_STEP_CHANGED'
  ));

notify pgrst, 'reload schema';
