-- Olivia OS 2.0 PHASE 6 — NAS Backup Watcher + Backup Ready Notification (§9)
--
-- photo_storage_events는 재사용하지 않는다 — project_id가 not null FK로 photo_storage_projects를
-- 가리켜서, 아직 어떤 project row도 없는 "NAS 백업 완료" 시점(1차 승인 이전, 심지어 프로젝트로
-- 등록되기도 전)의 이벤트를 표현할 수 없다. 대신 최소 신규 테이블만 추가한다.

create table if not exists public.worker_events (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  event_type text not null check (event_type in ('BACKUP_READY')),
  source text not null default 'NAS' check (source in ('NAS')),
  source_root text not null,
  folder_name text not null,
  file_count bigint not null default 0 check (file_count >= 0),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ACKNOWLEDGED', 'STARTED', 'COMPLETED', 'DISMISSED')),
  -- workerId+folderName+detectedAt 조합. 중복 POST(재전송 루프 포함)를 막는다(§8).
  event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists worker_events_status_idx
  on public.worker_events (status, created_at desc);

create index if not exists worker_events_worker_idx
  on public.worker_events (worker_id, created_at desc);

alter table public.worker_events enable row level security;

-- 브라우저는 service role을 직접 사용하지 않는다. 서버 API(관리자 세션 또는 worker 토큰 인증)가
-- service role로 읽고 쓰므로 anon/authenticated에는 직접 권한을 부여하지 않는다.
revoke all on table public.worker_events from anon, authenticated;
