-- Olivia Agent: 활성 12단계 워크플로우 + 고객 수정 반복 루프
-- 선행: workflow-agent.sql, workflow-automation-engine.sql, client-portal-schema.sql

update public.workflow_templates
set description = '상담부터 촬영, 납품, 고객 수정, 리워드까지 이어지는 4스테이지 12단계 촬영 운영 플로우입니다.',
    updated_at = now()
where id = '11111111-1111-1111-1111-111111111111';

-- 레거시 step row는 삭제하지 않는다. 신규 실행에 쓰는 12개 row만 표시 순서와 정책을 갱신한다.
insert into public.workflow_steps
  (template_id, step_key, name, description, order_index, requires_approval, creates_mailing_draft, visible_to_client, expected_days)
values
  ('11111111-1111-1111-1111-111111111111','consult_meeting', '상담 / 미팅',              '상담 내용과 고객 정보를 정리합니다.',                         1, false, false, false, 0),
  ('11111111-1111-1111-1111-111111111111','quote',           '견적서 생성 / 전달',        '견적 초안을 승인한 뒤 고객에게 전달합니다.',                 2, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','contract',        '계약서 작성 / 전달',        '계약서 초안을 승인한 뒤 고객에게 전달합니다.',               3, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','conti',           '콘티 작성 / 전달',          '촬영 콘티를 작성하고 승인 후 전달합니다.',                   4, true,  true,  true,  2),
  ('11111111-1111-1111-1111-111111111111','shooting',        '촬영',                     '촬영 완료 상태를 수동으로 확인합니다.',                       5, false, false, false, 0),
  ('11111111-1111-1111-1111-111111111111','payment_confirm', '잔금 / 계산서',             '입금 및 계산서 처리를 대표가 수동 확인합니다.',               6, false, false, false, 1),
  ('11111111-1111-1111-1111-111111111111','backup_sorting',  '백업 및 분류',              '촬영 데이터를 백업하고 JPG/RAW를 분류합니다.',                7, false, false, false, 1),
  ('11111111-1111-1111-1111-111111111111','client_selection','고객 사진 셀렉',           '원본 전달, 셀렉 갤러리, RAW 매칭을 한 단계에서 관리합니다.',   8, false, true,  true,  5),
  ('11111111-1111-1111-1111-111111111111','retouching',      '보정',                     '선택 사진을 보정합니다.',                                     9, false, false, false, 7),
  ('11111111-1111-1111-1111-111111111111','final_delivery',  '최종파일 전달 + 후기 요청', '검색 최적화 자료와 최종 파일을 승인 후 전달합니다.',          10, true,  true,  true,  1),
  ('11111111-1111-1111-1111-111111111111','revision',        '보정 전달 후 수정 접수',    '고객 수정 요청과 후기 콘텐츠 후보를 관리합니다.',            11, true,  true,  true,  3),
  ('11111111-1111-1111-1111-111111111111','reward',          '고객 리워드 (1%)',          '최종 완료 후 공급가 기준 1% 리워드를 계산합니다.',           12, false, false, false, 1)
on conflict (template_id, step_key) do update set
  name = excluded.name,
  description = excluded.description,
  order_index = excluded.order_index,
  requires_approval = excluded.requires_approval,
  creates_mailing_draft = excluded.creates_mailing_draft,
  visible_to_client = excluded.visible_to_client,
  expected_days = excluded.expected_days,
  updated_at = now();

alter table public.client_revision_requests
  add column if not exists project_id uuid,
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists step_key text not null default '',
  add column if not exists approval_id uuid references public.agent_approvals(id) on delete set null;

create index if not exists idx_client_revision_requests_workflow
  on public.client_revision_requests(workflow_run_id, created_at desc);

create index if not exists idx_client_revision_requests_approval
  on public.client_revision_requests(approval_id, created_at desc)
  where approval_id is not null;

-- 같은 승인 건에 처리 중인 수정 요청이 둘 이상 생기지 않도록 한다.
create unique index if not exists idx_client_revision_requests_active_approval
  on public.client_revision_requests(approval_id)
  where approval_id is not null and status in ('requested', 'in_progress');

create or replace function public.request_client_revision(
  p_client_id uuid,
  p_workflow_run_id uuid,
  p_project_id uuid,
  p_step_key text,
  p_approval_id uuid,
  p_title text,
  p_content text,
  p_request_type text default 'general',
  p_related_file text default '',
  p_priority text default 'normal'
)
returns table(request_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_client_id uuid;
  v_run_project_id uuid;
  v_approval_client_id uuid;
  v_approval_run_id uuid;
  v_approval_project_id uuid;
  v_approval_step_key text;
  v_approval_status text;
  v_approval_title text;
  v_request_id uuid;
  v_priority text;
begin
  if coalesce(trim(p_content), '') = '' then
    raise exception using errcode = '22023', message = 'REVISION_CONTENT_REQUIRED';
  end if;

  select client_id, project_id
    into v_run_client_id, v_run_project_id
  from public.workflow_runs
  where id = p_workflow_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'WORKFLOW_RUN_NOT_FOUND';
  end if;
  if v_run_client_id is distinct from p_client_id then
    raise exception using errcode = '42501', message = 'WORKFLOW_CLIENT_MISMATCH';
  end if;
  if p_project_id is not null and v_run_project_id is distinct from p_project_id then
    raise exception using errcode = '42501', message = 'WORKFLOW_PROJECT_MISMATCH';
  end if;

  select client_id, workflow_run_id, project_id, workflow_step_key, status, title
    into v_approval_client_id, v_approval_run_id, v_approval_project_id,
         v_approval_step_key, v_approval_status, v_approval_title
  from public.agent_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'APPROVAL_NOT_FOUND';
  end if;
  if v_approval_client_id is distinct from p_client_id
     or v_approval_run_id is distinct from p_workflow_run_id
     or (p_project_id is not null and v_approval_project_id is distinct from p_project_id) then
    raise exception using errcode = '42501', message = 'APPROVAL_OWNERSHIP_MISMATCH';
  end if;
  if v_approval_step_key is distinct from p_step_key then
    raise exception using errcode = '22023', message = 'APPROVAL_STEP_MISMATCH';
  end if;
  if p_step_key not in ('quote', 'contract', 'conti', 'client_selection', 'final_delivery', 'revision') then
    raise exception using errcode = '22023', message = 'STEP_NOT_CLIENT_VISIBLE';
  end if;
  if v_approval_status <> 'approved' then
    raise exception using errcode = '55000', message = 'APPROVAL_NOT_APPROVED';
  end if;

  select id into v_request_id
  from public.client_revision_requests
  where approval_id = p_approval_id
    and status in ('requested', 'in_progress')
  order by created_at desc
  limit 1;

  if v_request_id is not null then
    return query select v_request_id, false;
    return;
  end if;

  v_priority := case when p_priority in ('low', 'normal', 'high', 'urgent') then p_priority else 'normal' end;

  insert into public.client_revision_requests (
    client_id, project_id, workflow_run_id, step_key, approval_id,
    request_type, title, content, related_file, priority, status
  ) values (
    p_client_id, coalesce(p_project_id, v_run_project_id), p_workflow_run_id, p_step_key, p_approval_id,
    coalesce(nullif(p_request_type, ''), 'general'),
    coalesce(nullif(trim(p_title), ''), v_approval_title || ' 수정 요청'),
    p_content, coalesce(p_related_file, ''), v_priority, 'requested'
  ) returning id into v_request_id;

  update public.agent_approvals
  set status = 'revision_requested',
      admin_memo = p_content,
      updated_at = now()
  where id = p_approval_id;

  insert into public.agent_tasks (
    client_id, project_id, workflow_run_id, workflow_step_key, workflow_step_name,
    client_name, project_name, task_type, title, description, input_data, priority, status
  )
  select
    wr.client_id, wr.project_id, wr.id, p_step_key, p_step_key,
    wr.client_name, wr.project_name,
    'client_revision_review:' || v_request_id::text,
    '고객 수정 요청 검토: ' || coalesce(nullif(trim(p_title), ''), v_approval_title),
    p_content,
    jsonb_build_object(
      'revisionId', v_request_id,
      'approvalId', p_approval_id,
      'requestType', coalesce(nullif(p_request_type, ''), 'general'),
      'relatedFile', coalesce(p_related_file, '')
    ),
    case when v_priority in ('high', 'urgent') then v_priority else 'normal' end,
    'pending'
  from public.workflow_runs wr
  where wr.id = p_workflow_run_id;

  insert into public.client_portal_events (
    client_id, event_type, target_type, target_id, memo
  ) values (
    p_client_id, 'revision_requested', 'revision_request', v_request_id::text,
    coalesce(nullif(trim(p_title), ''), v_approval_title)
  );

  insert into public.agent_logs (
    client_id, project_id, workflow_run_id, log_type, message, input_summary, success
  ) values (
    p_client_id, coalesce(p_project_id, v_run_project_id), p_workflow_run_id,
    'client_revision_requested',
    '고객이 ' || coalesce(v_approval_title, p_step_key) || ' 결과에 수정 요청을 남겼습니다.',
    p_content,
    true
  );

  return query select v_request_id, true;
end;
$$;

create or replace function public.resubmit_client_revision(
  p_approval_id uuid,
  p_admin_memo text default ''
)
returns table(approval_id uuid, revision_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval public.agent_approvals%rowtype;
  v_revision_id uuid;
begin
  select * into v_approval
  from public.agent_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'APPROVAL_NOT_FOUND';
  end if;
  if v_approval.status <> 'revision_requested' then
    raise exception using errcode = '55000', message = 'APPROVAL_NOT_IN_REVISION';
  end if;

  select crr.id into v_revision_id
  from public.client_revision_requests crr
  where crr.approval_id = p_approval_id and crr.status = 'requested'
  order by crr.created_at desc
  limit 1
  for update;

  if v_revision_id is null then
    raise exception using errcode = 'P0002', message = 'REVISION_REQUEST_NOT_FOUND';
  end if;

  update public.client_revision_requests
  set status = 'in_progress',
      admin_reply = coalesce(p_admin_memo, ''),
      updated_at = now()
  where id = v_revision_id;

  update public.agent_tasks
  set status = 'completed',
      output_data = coalesce(output_data, '{}'::jsonb) || jsonb_build_object('resubmitted', true, 'adminMemo', coalesce(p_admin_memo, '')),
      completed_at = now(),
      updated_at = now()
  where workflow_run_id = v_approval.workflow_run_id
    and task_type = 'client_revision_review:' || v_revision_id::text;

  update public.agent_approvals
  set status = 'pending',
      admin_memo = coalesce(p_admin_memo, ''),
      approved_at = null,
      updated_at = now()
  where id = p_approval_id;

  insert into public.agent_logs (
    client_id, project_id, workflow_run_id, agent_task_id,
    log_type, message, input_summary, success
  ) values (
    v_approval.client_id, v_approval.project_id, v_approval.workflow_run_id, v_approval.agent_task_id,
    'client_revision_resubmitted',
    coalesce(v_approval.title, '승인 항목') || ' 수정본을 다시 승인 대기로 보냈습니다.',
    coalesce(p_admin_memo, ''),
    true
  );

  return query select p_approval_id, v_revision_id;
end;
$$;

revoke all on function public.request_client_revision(uuid, uuid, uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_client_revision(uuid, uuid, uuid, text, uuid, text, text, text, text, text) to service_role;

revoke all on function public.resubmit_client_revision(uuid, text) from public, anon, authenticated;
grant execute on function public.resubmit_client_revision(uuid, text) to service_role;
