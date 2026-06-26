-- Olivia Agent Workflow Engine 1단계
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  type text not null default 'hospital_shoot',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.workflow_templates(id) on delete cascade,
  step_key text not null,
  name text not null,
  description text default '',
  order_index integer not null default 0,
  requires_approval boolean not null default false,
  creates_mailing_draft boolean not null default false,
  visible_to_client boolean not null default false,
  expected_days integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, step_key)
);

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  project_id uuid,
  template_id uuid references public.workflow_templates(id) on delete set null,
  client_name text default '',
  project_name text default '',
  manager_name text default '',
  shoot_date date,
  current_step_key text not null default 'consult_meeting',
  next_action text default '',
  status text not null default 'active'
    check (status in ('active','paused','completed','canceled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','waiting_approval','completed','skipped','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  due_date date,
  result_summary text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  workflow_step_run_id uuid references public.workflow_step_runs(id) on delete set null,
  task_type text not null default 'general',
  title text not null,
  description text default '',
  input_data jsonb default '{}'::jsonb,
  output_data jsonb default '{}'::jsonb,
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','waiting_approval','canceled')),
  error_message text default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  agent_task_id uuid references public.agent_tasks(id) on delete set null,
  approval_type text not null default 'other'
    check (approval_type in ('quote','contract','conti','mailing','portal_link','content','per','report','other')),
  title text not null,
  description text default '',
  preview_data jsonb default '{}'::jsonb,
  related_type text default '',
  related_id text default '',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','revision_requested')),
  admin_memo text default '',
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  agent_task_id uuid references public.agent_tasks(id) on delete set null,
  log_type text not null,
  message text not null,
  input_summary text default '',
  output_summary text default '',
  success boolean not null default true,
  error_message text default '',
  created_at timestamptz not null default now()
);

create index if not exists workflow_runs_status_idx on public.workflow_runs(status, current_step_key);
create index if not exists workflow_runs_client_idx on public.workflow_runs(client_id);
create index if not exists agent_tasks_status_idx on public.agent_tasks(status, priority, created_at desc);
create index if not exists agent_approvals_status_idx on public.agent_approvals(status, created_at desc);
create index if not exists agent_logs_created_idx on public.agent_logs(created_at desc);

insert into public.workflow_templates (id, name, description, type, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  '병원 촬영 기본 워크플로우',
  '상담·미팅부터 원본전달, 최종파일 전달, 후기 콘텐츠 제작, 리워드 적립까지 이어지는 14단계 촬영 운영 플로우입니다.',
  'hospital_shoot',
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  is_active = excluded.is_active,
  updated_at = now();

-- 구 22단계 삭제 후 새 14단계로 교체
delete from public.workflow_steps
where template_id = '11111111-1111-1111-1111-111111111111'
  and step_key not in (
    'consult_meeting','quote','contract','conti','shooting',
    'backup_sorting','original_delivery','retouching','revision',
    'final_delivery','review_content','reward','customer_care','content_planning'
  );

insert into public.workflow_steps
  (template_id, step_key, name, description, order_index, requires_approval, creates_mailing_draft, visible_to_client, expected_days)
values
  ('11111111-1111-1111-1111-111111111111','consult_meeting',   '상담 / 미팅',                  '상담 메모, 병원 정보 등록. 필요 시 사전자료 요청 포함.',        1, false, false, false, 0),
  ('11111111-1111-1111-1111-111111111111','quote',             '견적서 생성 / 전달',            '자동 생성 후 승인 시 발송. 거절 시 이유를 notes에 기록.',       2, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','contract',          '계약서 작성 / 전달',            '자동 생성 후 승인 시에만 다음 단계로 전진.',                    3, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','conti',             '콘티 작성 / 전달',              '일부 자동 생성, 보완 후 승인 시 발송. /api/conti 연결.',        4, true,  true,  true,  2),
  ('11111111-1111-1111-1111-111111111111','shooting',          '촬영',                         '자동화 대상 아님. 상태 전환만 수동.',                           5, false, false, false, 0),
  ('11111111-1111-1111-1111-111111111111','backup_sorting',    '백업 및 분류',                  'RAW/JPG 자동 분류. 씬별 분류는 사람이 보완.',                   6, false, false, false, 1),
  ('11111111-1111-1111-1111-111111111111','original_delivery', '원본 데이터 전달',              'NAS 공유링크 생성 후 자동 발송. 승인 불필요.',                   7, false, false, true,  1),
  ('11111111-1111-1111-1111-111111111111','retouching',        '보정',                         '수동. Evoto 일부 활용, 색감 체크 기능 보조.',                    8, false, false, false, 7),
  ('11111111-1111-1111-1111-111111111111','revision',          '보정 전달 후 수정 접수',        '수정 요청 접수 시 담당자 알람, 승인 후 재발송.',                 9, true,  true,  true,  3),
  ('11111111-1111-1111-1111-111111111111','final_delivery',    '최종파일 전달 + 후기 요청',     '최종파일 메일에 후기 작성폼 동시 포함. 승인 후 발송.',          10, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','review_content',    '후기 DB 저장 / 콘텐츠 제작',   '인스타/블로그용 소스로 자동 변환 후 승인.',                     11, true,  false, false, 3),
  ('11111111-1111-1111-1111-111111111111','reward',            '고객 리워드 (1%)',              '촬영 금액의 1% 자동 산출 및 PER 포인트 적립.',                  12, false, false, false, 1),
  ('11111111-1111-1111-1111-111111111111','customer_care',     '고객관리 (주기 알람/이벤트)',   '조건 충족 시 자동 발송 트리거, 이벤트 내용 승인.',              13, true,  true,  true,  0),
  ('11111111-1111-1111-1111-111111111111','content_planning',  '스토리 콘텐츠 기획',           '기획은 사람, 블로그 소스 연계만 자동 보조.',                    14, false, false, false, 0)
on conflict (template_id, step_key) do update set
  name            = excluded.name,
  description     = excluded.description,
  order_index     = excluded.order_index,
  requires_approval    = excluded.requires_approval,
  creates_mailing_draft = excluded.creates_mailing_draft,
  visible_to_client    = excluded.visible_to_client,
  expected_days        = excluded.expected_days,
  updated_at      = now();
