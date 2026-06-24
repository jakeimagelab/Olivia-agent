-- 워크플로우 14단계 재정의 마이그레이션
-- 실행일: 2026-06-25

-- 1. shoot-reminder 중복 발송 방지를 위한 컬럼 추가
alter table workflow_runs
  add column if not exists reminder_sent_at timestamptz;

-- 2. mailing_queue에 workflow_run_id 연결 컬럼 추가 (없으면)
alter table mailing_queue
  add column if not exists workflow_run_id text;

-- 3. workflow_runs에 contact 정보 컬럼 추가 (없으면)
alter table workflow_runs
  add column if not exists contact_name  text,
  add column if not exists contact_email text;

-- 4. (참고) clients.workflow_status 컬럼은 코드에서 더 이상 읽지 않음.
--    한 사이클 운영 후 아래 명령으로 정리:
--    alter table clients drop column if exists workflow_status;
