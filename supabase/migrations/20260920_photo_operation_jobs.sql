-- 채팅/사진작업실에서 같은 프로젝트의 동일 작업을 빠르게 두 번 눌러도
-- 실행 중 job은 하나만 존재한다. 완료/실패 후 명시적 재시도는 새 job을 만들 수 있다.
create unique index if not exists remote_jobs_one_active_photo_operation
on public.remote_jobs (
  action,
  (payload ->> 'project_id')
)
where status in ('QUEUED', 'RUNNING')
  and action in ('PHOTO_RAW_MATCH', 'PHOTO_RESIZE', 'PHOTO_AI_SELECT', 'PHOTO_RETOUCH')
  and payload ? 'project_id';
