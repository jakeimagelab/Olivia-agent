-- 원격 사진 분류 작업의 안전한 취소 요청 상태.
alter table public.remote_jobs
  add column if not exists cancel_requested_at timestamptz;

alter table public.remote_jobs
  drop constraint if exists remote_jobs_status_check;

alter table public.remote_jobs
  add constraint remote_jobs_status_check
  check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELED'));
