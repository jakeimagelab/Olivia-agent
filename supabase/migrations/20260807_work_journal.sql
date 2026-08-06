-- 업무일지 — 내부 직원 전용 날짜별 To-do/체크리스트 공유 기능.
-- 고객관리/견적/계약/고객 포털/CRM 워크플로우와 전혀 연결하지 않는 독립 도구다.
-- library_items/youtube_editing_*와 동일하게 RLS 없이 미들웨어(관리자 세션) + service role 접근 패턴을 따른다.

create table if not exists public.work_journal_tasks (
  id            uuid primary key default gen_random_uuid(),
  due_date      date not null,
  due_time      text,
  title         text not null default '',
  assignee_name text,
  status        text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  priority      text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  memo          text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.work_journal_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.work_journal_tasks(id) on delete cascade,
  label       text not null default '',
  done        boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.work_journal_files (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.work_journal_tasks(id) on delete cascade,
  file_name     text not null,
  file_size     bigint,
  storage_path  text not null,
  file_url      text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_work_journal_tasks_due_date on public.work_journal_tasks(due_date);
create index if not exists idx_work_journal_checklist_items_task on public.work_journal_checklist_items(task_id, sort_order);
create index if not exists idx_work_journal_files_task on public.work_journal_files(task_id);

-- 첨부파일(사진/문서) 저장용 공개 버킷 — 내부 공유 도구라 사내 링크로만 접근한다는 전제로 공개 버킷을 쓴다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-journal-files', 'work-journal-files', true, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/plain'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
