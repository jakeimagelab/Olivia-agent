-- remote_jobs.action은 현재 text이며 별도 action CHECK 제약이 없다.
-- PERSON_SELECT_IMPORT는 서버 허용 목록과 Worker runner 매핑으로 제한한다.
comment on table public.remote_jobs is
  'Mac Studio remote jobs. PERSON_SELECT_IMPORT is an allowed action as of 2026-10-19.';
