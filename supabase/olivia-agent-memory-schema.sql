-- Olivia Agent Adaptive Memory — 사용자가 채팅으로 가르친 업무 규칙/별칭/선호/교정을 저장한다.
-- 신규 설치와 기존 부분 설치 모두에 반복 실행할 수 있는 additive 마이그레이션입니다.
-- 주의: 이 파일은 로컬에만 생성되며, 원격 Supabase에는 자동 적용되지 않습니다. 실제로
-- 자동 고객/프로젝트 생성 같은 기능이 동작하려면 이 파일을 직접 적용해야 합니다.

create table if not exists public.olivia_agent_memory (
  id                 uuid primary key default gen_random_uuid(),
  memory_type        text not null check (memory_type in (
    'business_rule', 'alias', 'preference', 'correction',
    'workflow_rule', 'document_rule', 'tool_behavior'
  )),
  key                text not null,
  value              jsonb not null,
  scope              text,
  priority           integer not null default 50,
  confidence         numeric not null default 1,
  source             text,
  source_message_id  uuid,
  usage_count        integer not null default 0,
  success_count      integer not null default 0,
  failure_count      integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (key, scope)
);

create index if not exists idx_olivia_agent_memory_scope on public.olivia_agent_memory(scope, is_active);
create index if not exists idx_olivia_agent_memory_type on public.olivia_agent_memory(memory_type, is_active);

-- updated_at 트리거 — clients-schema.sql 등 기존 테이블과 동일하게 공용 함수를 재사용한다.
drop trigger if exists olivia_agent_memory_updated_at on public.olivia_agent_memory;
create trigger olivia_agent_memory_updated_at
  before update on public.olivia_agent_memory
  for each row execute procedure public.set_updated_at();

alter table public.olivia_agent_memory enable row level security;
drop policy if exists "service role olivia_agent_memory" on public.olivia_agent_memory;
create policy "service role olivia_agent_memory"
  on public.olivia_agent_memory for all to service_role using (true) with check (true);

grant all on table public.olivia_agent_memory to service_role;

-- ── Seed rules — 사용자가 채팅으로 이미 여러 번 확정한 규칙(코드 요청서 12번 항목) ──
-- on conflict로 재실행 안전. 실제로 활성화되려면 이 마이그레이션이 적용돼야 한다 — 적용
-- 전까지는 대응하는 시스템 프롬프트 하드코딩 규칙(이번 세션에 이미 추가됨)만 동작한다.

insert into public.olivia_agent_memory (memory_type, key, value, scope, priority, confidence, source, is_active)
values
  (
    'business_rule',
    'quote_auto_client_project_creation',
    jsonb_build_object(
      'trigger', 'create_quote_requested',
      'ifClientMissing', 'create_client_from_request',
      'ifProjectMissing', 'create_project_from_request',
      'then', 'create_quote',
      'never', jsonb_build_array('ask_user_to_register_client_first')
    ),
    'quote',
    100,
    1,
    'seed',
    true
  ),
  (
    'alias',
    'select_matching_alias_group',
    jsonb_build_object(
      'terms', jsonb_build_array('셀렉매칭', '셀렉 매칭', 'RAW매칭', 'RAW 매칭', '원본매칭', '원본 매칭'),
      'canonical', 'select_match'
    ),
    'select_match',
    90,
    1,
    'seed',
    true
  ),
  (
    'alias',
    'storyboard_alias_group',
    jsonb_build_object(
      'terms', jsonb_build_array('콘티', '촬영콘티', '스토리보드', '촬영안', '촬영기획'),
      'canonical', 'storyboard'
    ),
    'storyboard',
    90,
    1,
    'seed',
    true
  ),
  (
    'document_rule',
    'storyboard_person_list_split',
    jsonb_build_object(
      'when', 'person_list_input',
      'splitEachPerson', true,
      'preserveTeam', true,
      'preserveRole', true,
      'preserveName', true,
      'preserveLocation', true,
      'neverRepeatWholeListPerRow', true
    ),
    'storyboard',
    100,
    1,
    'seed',
    true
  ),
  (
    'document_rule',
    'storyboard_location_no_inference',
    jsonb_build_object(
      'when', 'location_field_input',
      'neverInferFloorOrDetailFromRoomNumber', true,
      'ifInferenceNeeded', 'mention_as_caveat_in_reply_only_never_store'
    ),
    'storyboard',
    100,
    1,
    'seed',
    true
  )
on conflict (key, scope) do nothing;

notify pgrst, 'reload schema';
