-- 채팅의 고객 "삭제"는 물리 삭제가 아니라 목록 보관으로 처리한다.
-- 프로젝트/문서 FK는 그대로 유지하고, 고객 목록·검색에서만 이 컬럼으로 제외한다.
alter table public.clients
  add column if not exists archived_at timestamptz;

create index if not exists idx_clients_active_created_at
  on public.clients(created_at desc)
  where archived_at is null;

notify pgrst, 'reload schema';
