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
  current_step_key text not null default 'consult_received',
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
  '상담 접수부터 갤러리 전달, 리뷰 요청, PER 포인트 적립까지 이어지는 기본 촬영 운영 플로우입니다.',
  'hospital_shoot',
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.workflow_steps
  (template_id, step_key, name, description, order_index, requires_approval, creates_mailing_draft, visible_to_client, expected_days)
values
  ('11111111-1111-1111-1111-111111111111','consult_received','상담접수','상담 메모와 문의 경로를 정리합니다.',1,false,false,false,0),
  ('11111111-1111-1111-1111-111111111111','client_created','고객정보 생성','병원명, 담당자, 연락처, 채널 정보를 정리합니다.',2,false,false,false,1),
  ('11111111-1111-1111-1111-111111111111','materials_request','사전자료 요청','촬영 전 필요한 로고, 공간, 의료진 자료를 요청합니다.',3,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','quote_draft','견적서 생성','상담 내용을 바탕으로 견적서 초안을 생성합니다.',4,true,false,false,1),
  ('11111111-1111-1111-1111-111111111111','quote_waiting_send','견적 발송 대기','견적서 발송 전 대표님 승인을 기다립니다.',5,true,true,false,1),
  ('11111111-1111-1111-1111-111111111111','contract_draft','계약서 생성','승인된 견적을 바탕으로 계약서 초안을 생성합니다.',6,true,false,false,1),
  ('11111111-1111-1111-1111-111111111111','contract_waiting_send','계약 발송 대기','계약서 발송 전 승인을 기다립니다.',7,true,true,false,1),
  ('11111111-1111-1111-1111-111111111111','prep_request','촬영 준비사항 요청','촬영 전 준비사항 체크리스트와 요청 메일을 생성합니다.',8,true,true,true,2),
  ('11111111-1111-1111-1111-111111111111','conti_draft','콘티 생성','촬영 콘티와 타임테이블 초안을 생성합니다.',9,true,false,false,2),
  ('11111111-1111-1111-1111-111111111111','conti_waiting_send','콘티 발송 대기','콘티 확인 메일 발송 전 승인을 기다립니다.',10,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','shoot_reminder','촬영 전 리마인드','촬영 D-3/D-1 리마인드 메일을 준비합니다.',11,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','shoot_done','촬영 완료','촬영 완료 후 납품 플로우로 전환합니다.',12,false,false,false,0),
  ('11111111-1111-1111-1111-111111111111','original_delivery','원본 전달','원본 전달 메일 초안을 생성합니다.',13,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','retouching','보정 진행','보정 상태와 수정 요청을 관리합니다.',14,false,false,true,7),
  ('11111111-1111-1111-1111-111111111111','gallery_delivery','갤러리 전달','갤러리 전달 메일과 고객 포털 링크를 준비합니다.',15,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','revision_manage','수정 요청 관리','수정 요청을 분류하고 처리 상태를 관리합니다.',16,false,false,true,3),
  ('11111111-1111-1111-1111-111111111111','review_request','리뷰 요청','리뷰 요청 메일과 안내 문구를 생성합니다.',17,true,true,true,1),
  ('11111111-1111-1111-1111-111111111111','review_collected','리뷰 수집','수집된 리뷰를 정리합니다.',18,false,false,false,3),
  ('11111111-1111-1111-1111-111111111111','content_production','콘텐츠 제작','리뷰와 촬영 결과를 활용한 콘텐츠 초안을 생성합니다.',19,true,false,false,7),
  ('11111111-1111-1111-1111-111111111111','monthly_report','월간 리포트','월간 성과 리포트 초안을 생성합니다.',20,true,true,true,2),
  ('11111111-1111-1111-1111-111111111111','per_points','PER 포인트 적립','촬영 금액 기준 PER 포인트 적립 후보를 생성합니다.',21,true,false,true,1),
  ('11111111-1111-1111-1111-111111111111','next_proposal','재제안 / 구독 제안','후속 촬영 또는 구독 제안을 생성합니다.',22,true,true,false,3)
on conflict (template_id, step_key) do update set
  name = excluded.name,
  description = excluded.description,
  order_index = excluded.order_index,
  requires_approval = excluded.requires_approval,
  creates_mailing_draft = excluded.creates_mailing_draft,
  visible_to_client = excluded.visible_to_client,
  expected_days = excluded.expected_days,
  updated_at = now();
