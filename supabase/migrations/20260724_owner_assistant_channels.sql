-- Olivia 2.0 대표자용 외부 채널 공통 기반
-- 기존 웹/텔레그램/Olivia 테이블을 보존하는 additive migration.

create table if not exists public.assistant_owners (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null default 'primary_owner',
  email text,
  display_name text not null default '대표자',
  role text not null default 'OWNER',
  status text not null default 'active',
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_owners_owner_key_length check (char_length(owner_key) between 1 and 80),
  constraint assistant_owners_role_check check (role in ('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')),
  constraint assistant_owners_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists assistant_owners_owner_key_unique
  on public.assistant_owners(owner_key);
create unique index if not exists assistant_owners_email_unique
  on public.assistant_owners(lower(email))
  where email is not null;

create table if not exists public.assistant_channel_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  channel text not null,
  status text not null default 'active',
  external_user_id_hash text not null,
  external_user_id_encrypted text not null,
  channel_user_key_hash text,
  channel_user_key_encrypted text,
  app_user_id_hash text,
  app_user_id_encrypted text,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  last_received_at timestamptz,
  last_sent_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_channel_connections_channel_check
    check (channel in ('web', 'telegram', 'kakao', 'voice')),
  constraint assistant_channel_connections_status_check
    check (status in ('active', 'blocked', 'disconnected'))
);

create unique index if not exists assistant_channel_connections_external_unique
  on public.assistant_channel_connections(channel, external_user_id_hash);
create unique index if not exists assistant_channel_connections_owner_active_unique
  on public.assistant_channel_connections(owner_id, channel)
  where status = 'active';
create index if not exists assistant_channel_connections_owner_idx
  on public.assistant_channel_connections(owner_id, updated_at desc);

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  title text not null default '',
  status text not null default 'active',
  summary text not null default '',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_conversations_title_length check (char_length(title) <= 200),
  constraint assistant_conversations_summary_length check (char_length(summary) <= 20000),
  constraint assistant_conversations_status_check check (status in ('active', 'archived'))
);

create index if not exists assistant_conversations_owner_latest_idx
  on public.assistant_conversations(owner_id, last_message_at desc nulls last, created_at desc);

create table if not exists public.assistant_action_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  message_id uuid,
  source_channel text not null default 'web',
  action_name text not null,
  parameters jsonb not null default '{}'::jsonb,
  permission_level text not null default 'OWNER',
  confirmation_required boolean not null default false,
  status text not null default 'queued',
  idempotency_key text not null,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  olivia_action_id uuid references public.olivia_actions(id) on delete set null,
  agent_approval_id uuid references public.agent_approvals(id) on delete set null,
  started_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_action_requests_channel_check
    check (source_channel in ('web', 'telegram', 'kakao', 'voice')),
  constraint assistant_action_requests_action_name_length
    check (char_length(action_name) between 1 and 120),
  constraint assistant_action_requests_permission_check
    check (permission_level in ('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')),
  constraint assistant_action_requests_status_check
    check (status in (
      'queued', 'processing', 'waiting_confirmation', 'approved',
      'completed', 'failed', 'cancelled', 'expired'
    )),
  constraint assistant_action_requests_error_length
    check (error_message is null or char_length(error_message) <= 2000)
);

create unique index if not exists assistant_action_requests_idempotency_unique
  on public.assistant_action_requests(idempotency_key);
create index if not exists assistant_action_requests_owner_status_idx
  on public.assistant_action_requests(owner_id, status, created_at desc);
create index if not exists assistant_action_requests_conversation_idx
  on public.assistant_action_requests(conversation_id, created_at desc);
create index if not exists assistant_action_requests_waiting_idx
  on public.assistant_action_requests(created_at)
  where status = 'waiting_confirmation';

create table if not exists public.assistant_confirmations (
  id uuid primary key default gen_random_uuid(),
  action_request_id uuid not null references public.assistant_action_requests(id) on delete cascade,
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  token_hash text not null,
  status text not null default 'waiting',
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_confirmations_status_check
    check (status in ('waiting', 'confirmed', 'cancelled', 'expired'))
);

create unique index if not exists assistant_confirmations_token_unique
  on public.assistant_confirmations(token_hash);
create unique index if not exists assistant_confirmations_action_waiting_unique
  on public.assistant_confirmations(action_request_id)
  where status = 'waiting';
create index if not exists assistant_confirmations_owner_waiting_idx
  on public.assistant_confirmations(owner_id, expires_at)
  where status = 'waiting';

create table if not exists public.assistant_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  owner_id uuid references public.assistant_owners(id) on delete set null,
  channel_connection_id uuid references public.assistant_channel_connections(id) on delete set null,
  payload_digest text not null,
  sanitized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint assistant_webhook_events_provider_check
    check (provider in ('kakao_skill', 'kakao_channel', 'telegram')),
  constraint assistant_webhook_events_status_check
    check (status in ('received', 'processing', 'processed', 'ignored', 'failed'))
);

create unique index if not exists assistant_webhook_events_provider_key_unique
  on public.assistant_webhook_events(provider, event_key);
create index if not exists assistant_webhook_events_pending_idx
  on public.assistant_webhook_events(received_at)
  where status in ('received', 'failed');

create table if not exists public.assistant_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.assistant_owners(id) on delete set null,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  message_id uuid,
  notification_id uuid references public.olivia_notification_history(id) on delete set null,
  channel text not null,
  external_request_id text,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  response_code integer,
  response_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_delivery_attempts_channel_check
    check (channel in ('web', 'telegram', 'kakao')),
  constraint assistant_delivery_attempts_status_check
    check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'cancelled')),
  constraint assistant_delivery_attempts_count_check check (attempt_count between 0 and 20),
  constraint assistant_delivery_attempts_error_length
    check (error_message is null or char_length(error_message) <= 2000)
);

create unique index if not exists assistant_delivery_attempts_external_unique
  on public.assistant_delivery_attempts(channel, external_request_id)
  where external_request_id is not null;
create index if not exists assistant_delivery_attempts_retry_idx
  on public.assistant_delivery_attempts(next_retry_at, created_at)
  where status in ('queued', 'failed');

create table if not exists public.assistant_link_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  channel text not null,
  code_hash text not null,
  status text not null default 'active',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint assistant_link_codes_channel_check check (channel in ('telegram', 'kakao')),
  constraint assistant_link_codes_status_check check (status in ('active', 'consumed', 'expired', 'locked')),
  constraint assistant_link_codes_attempt_check
    check (attempt_count >= 0 and max_attempts between 1 and 20)
);

create unique index if not exists assistant_link_codes_hash_unique
  on public.assistant_link_codes(code_hash);
create index if not exists assistant_link_codes_active_idx
  on public.assistant_link_codes(owner_id, channel, expires_at)
  where status = 'active';

create table if not exists public.assistant_notification_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  morning_enabled boolean not null default true,
  morning_time time not null default '08:00',
  afternoon_enabled boolean not null default true,
  afternoon_time time not null default '14:00',
  evening_enabled boolean not null default true,
  evening_time time not null default '19:00',
  timezone text not null default 'Asia/Seoul',
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  important_email_enabled boolean not null default true,
  calendar_enabled boolean not null default true,
  photo_enabled boolean not null default true,
  project_delay_enabled boolean not null default true,
  system_error_enabled boolean not null default true,
  kakao_enabled boolean not null default false,
  web_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_notification_settings_timezone_length
    check (char_length(timezone) between 1 and 80)
);

create unique index if not exists assistant_notification_settings_owner_unique
  on public.assistant_notification_settings(owner_id);

create table if not exists public.assistant_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.assistant_owners(id) on delete set null,
  source_channel text not null default 'web',
  event_type text not null,
  target_type text,
  target_id text,
  action text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint assistant_audit_logs_channel_check
    check (source_channel in ('web', 'telegram', 'kakao', 'voice', 'system')),
  constraint assistant_audit_logs_event_length check (char_length(event_type) between 1 and 120),
  constraint assistant_audit_logs_action_length check (char_length(action) between 1 and 200)
);

create index if not exists assistant_audit_logs_owner_created_idx
  on public.assistant_audit_logs(owner_id, created_at desc);
create index if not exists assistant_audit_logs_request_idx
  on public.assistant_audit_logs(request_id)
  where request_id is not null;

create table if not exists public.assistant_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.assistant_owners(id) on delete set null,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  priority integer not null default 50,
  idempotency_key text not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_jobs_type_length check (char_length(job_type) between 1 and 120),
  constraint assistant_jobs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  constraint assistant_jobs_priority_check check (priority between 0 and 100),
  constraint assistant_jobs_attempt_check
    check (attempt_count >= 0 and max_attempts between 1 and 20),
  constraint assistant_jobs_error_length
    check (last_error_message is null or char_length(last_error_message) <= 2000)
);

create unique index if not exists assistant_jobs_idempotency_unique
  on public.assistant_jobs(idempotency_key);
create index if not exists assistant_jobs_claim_idx
  on public.assistant_jobs(priority desc, available_at, created_at)
  where status in ('queued', 'failed');
create index if not exists assistant_jobs_lease_idx
  on public.assistant_jobs(lease_expires_at)
  where status = 'processing';

create table if not exists public.assistant_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  provider text not null,
  account_email text,
  encrypted_refresh_token text not null,
  encrypted_access_token text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active',
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_oauth_credentials_provider_check check (provider in ('google')),
  constraint assistant_oauth_credentials_status_check check (status in ('active', 'expired', 'revoked'))
);

create unique index if not exists assistant_oauth_credentials_owner_provider_unique
  on public.assistant_oauth_credentials(owner_id, provider);

create table if not exists public.assistant_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.assistant_owners(id) on delete cascade,
  conversation_id uuid references public.assistant_conversations(id) on delete set null,
  token_hash text not null,
  status text not null default 'active',
  transcript text,
  message_id uuid,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint assistant_voice_sessions_status_check
    check (status in ('active', 'processing', 'completed', 'failed', 'expired')),
  constraint assistant_voice_sessions_transcript_length
    check (transcript is null or char_length(transcript) <= 20000)
);

create unique index if not exists assistant_voice_sessions_token_unique
  on public.assistant_voice_sessions(token_hash);
create index if not exists assistant_voice_sessions_active_idx
  on public.assistant_voice_sessions(expires_at)
  where status in ('active', 'processing');

-- 기존 대화/알림/브리핑 구조는 삭제하지 않고 공통 채널 필드만 추가한다.
alter table public.olivia_chat_messages
  add column if not exists conversation_id uuid references public.assistant_conversations(id) on delete set null,
  add column if not exists owner_id uuid references public.assistant_owners(id) on delete set null,
  add column if not exists external_message_id text,
  add column if not exists parent_message_id uuid references public.olivia_chat_messages(id) on delete set null,
  add column if not exists channel text,
  add column if not exists delivery_status text;

update public.olivia_chat_messages
set channel = coalesce(channel, source, 'web')
where channel is null;

alter table public.olivia_chat_messages
  alter column channel set default 'web';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'olivia_chat_messages_source_check'
      and conrelid = 'public.olivia_chat_messages'::regclass
  ) then
    alter table public.olivia_chat_messages
      drop constraint olivia_chat_messages_source_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_chat_messages_source_check'
      and conrelid = 'public.olivia_chat_messages'::regclass
  ) then
    alter table public.olivia_chat_messages
      add constraint olivia_chat_messages_source_check
      check (source in ('web', 'telegram', 'kakao', 'voice'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_chat_messages_channel_check'
      and conrelid = 'public.olivia_chat_messages'::regclass
  ) then
    alter table public.olivia_chat_messages
      add constraint olivia_chat_messages_channel_check
      check (channel in ('web', 'telegram', 'kakao', 'voice'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_chat_messages_delivery_status_check'
      and conrelid = 'public.olivia_chat_messages'::regclass
  ) then
    alter table public.olivia_chat_messages
      add constraint olivia_chat_messages_delivery_status_check
      check (
        delivery_status is null
        or delivery_status in ('queued', 'sent', 'accepted', 'delivered', 'failed')
      );
  end if;
end $$;

create index if not exists olivia_chat_messages_conversation_idx
  on public.olivia_chat_messages(conversation_id, created_at desc);
create index if not exists olivia_chat_messages_owner_idx
  on public.olivia_chat_messages(owner_id, created_at desc);
create unique index if not exists olivia_chat_messages_external_unique
  on public.olivia_chat_messages(channel, external_message_id)
  where external_message_id is not null;
create index if not exists olivia_chat_messages_parent_idx
  on public.olivia_chat_messages(parent_message_id)
  where parent_message_id is not null;

alter table public.olivia_notification_history
  add column if not exists owner_id uuid references public.assistant_owners(id) on delete set null,
  add column if not exists priority text not null default 'NORMAL',
  add column if not exists delivery_status text not null default 'queued',
  add column if not exists read_at timestamptz,
  add column if not exists action_taken text,
  add column if not exists scheduled_at timestamptz;

alter table public.olivia_briefings
  add column if not exists owner_id uuid references public.assistant_owners(id) on delete set null,
  add column if not exists delivery_status text not null default 'generated';

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'olivia_briefings_briefing_type_check'
      and conrelid = 'public.olivia_briefings'::regclass
  ) then
    alter table public.olivia_briefings
      drop constraint olivia_briefings_briefing_type_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_briefings_briefing_type_check'
      and conrelid = 'public.olivia_briefings'::regclass
  ) then
    alter table public.olivia_briefings
      add constraint olivia_briefings_briefing_type_check
      check (briefing_type in (
        'morning', 'afternoon', 'evening', 'weekly', 'meeting_pre', 'meeting_post'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_notification_history_priority_check'
      and conrelid = 'public.olivia_notification_history'::regclass
  ) then
    alter table public.olivia_notification_history
      add constraint olivia_notification_history_priority_check
      check (priority in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_notification_history_delivery_check'
      and conrelid = 'public.olivia_notification_history'::regclass
  ) then
    alter table public.olivia_notification_history
      add constraint olivia_notification_history_delivery_check
      check (delivery_status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'cancelled'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'olivia_briefings_delivery_check'
      and conrelid = 'public.olivia_briefings'::regclass
  ) then
    alter table public.olivia_briefings
      add constraint olivia_briefings_delivery_check
      check (delivery_status in ('generated', 'queued', 'sending', 'sent', 'failed'));
  end if;
end $$;

create index if not exists olivia_notification_owner_status_idx
  on public.olivia_notification_history(owner_id, delivery_status, scheduled_at);
create index if not exists olivia_briefings_owner_latest_idx
  on public.olivia_briefings(owner_id, briefing_date desc, generated_at desc);

-- 신규 메시지 FK는 기존 메시지 테이블 생성 순서와 호환되도록 별도 추가한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_action_requests_message_id_fkey'
      and conrelid = 'public.assistant_action_requests'::regclass
  ) then
    alter table public.assistant_action_requests
      add constraint assistant_action_requests_message_id_fkey
      foreign key (message_id) references public.olivia_chat_messages(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_delivery_attempts_message_id_fkey'
      and conrelid = 'public.assistant_delivery_attempts'::regclass
  ) then
    alter table public.assistant_delivery_attempts
      add constraint assistant_delivery_attempts_message_id_fkey
      foreign key (message_id) references public.olivia_chat_messages(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_voice_sessions_message_id_fkey'
      and conrelid = 'public.assistant_voice_sessions'::regclass
  ) then
    alter table public.assistant_voice_sessions
      add constraint assistant_voice_sessions_message_id_fkey
      foreign key (message_id) references public.olivia_chat_messages(id) on delete set null;
  end if;
end $$;

create index if not exists assistant_action_requests_message_idx
  on public.assistant_action_requests(message_id)
  where message_id is not null;
create index if not exists assistant_delivery_attempts_message_idx
  on public.assistant_delivery_attempts(message_id)
  where message_id is not null;
create index if not exists assistant_voice_sessions_message_idx
  on public.assistant_voice_sessions(message_id)
  where message_id is not null;

create or replace function public.set_assistant_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assistant_owners',
    'assistant_channel_connections',
    'assistant_conversations',
    'assistant_action_requests',
    'assistant_confirmations',
    'assistant_delivery_attempts',
    'assistant_notification_settings',
    'assistant_jobs',
    'assistant_oauth_credentials'
  ]
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute procedure public.set_assistant_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- 여러 worker가 같은 작업을 가져가지 않도록 SKIP LOCKED로 원자적 claim.
create or replace function public.claim_assistant_jobs(
  p_worker_id text,
  p_limit integer default 5,
  p_lease_seconds integer default 55
)
returns setof public.assistant_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select j.id
    from public.assistant_jobs j
    where (
      (j.status in ('queued', 'failed') and j.available_at <= now())
      or (j.status = 'processing' and j.lease_expires_at < now())
    )
      and j.attempt_count < j.max_attempts
    order by j.priority desc, j.available_at, j.created_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  update public.assistant_jobs j
  set
    status = 'processing',
    worker_id = left(p_worker_id, 120),
    lease_expires_at = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 300))),
    attempt_count = j.attempt_count + 1,
    updated_at = now()
  from claimable
  where j.id = claimable.id
  returning j.*;
end;
$$;

-- 승인 토큰은 waiting 상태와 만료 시간을 동시에 검사해 한 번만 소비한다.
create or replace function public.claim_assistant_confirmation(
  p_token_hash text,
  p_owner_id uuid,
  p_decision text
)
returns setof public.assistant_confirmations
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_decision not in ('confirm', 'cancel') then
    raise exception 'invalid confirmation decision';
  end if;

  return query
  update public.assistant_confirmations c
  set
    status = case when p_decision = 'confirm' then 'confirmed' else 'cancelled' end,
    confirmed_at = case when p_decision = 'confirm' then now() else c.confirmed_at end,
    cancelled_at = case when p_decision = 'cancel' then now() else c.cancelled_at end,
    consumed_at = now(),
    updated_at = now()
  where c.token_hash = p_token_hash
    and c.owner_id = p_owner_id
    and c.status = 'waiting'
    and c.expires_at > now()
  returning c.*;
end;
$$;

revoke all on function public.claim_assistant_jobs(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_assistant_jobs(text, integer, integer)
  to service_role;
revoke all on function public.claim_assistant_confirmation(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_assistant_confirmation(text, uuid, text)
  to service_role;

-- 모든 외부 채널 비밀과 실행 이력은 서버 service role만 접근한다.
alter table public.assistant_owners enable row level security;
alter table public.assistant_channel_connections enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_action_requests enable row level security;
alter table public.assistant_confirmations enable row level security;
alter table public.assistant_webhook_events enable row level security;
alter table public.assistant_delivery_attempts enable row level security;
alter table public.assistant_link_codes enable row level security;
alter table public.assistant_notification_settings enable row level security;
alter table public.assistant_audit_logs enable row level security;
alter table public.assistant_jobs enable row level security;
alter table public.assistant_oauth_credentials enable row level security;
alter table public.assistant_voice_sessions enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assistant_owners',
    'assistant_channel_connections',
    'assistant_conversations',
    'assistant_action_requests',
    'assistant_confirmations',
    'assistant_webhook_events',
    'assistant_delivery_attempts',
    'assistant_link_codes',
    'assistant_notification_settings',
    'assistant_audit_logs',
    'assistant_jobs',
    'assistant_oauth_credentials',
    'assistant_voice_sessions'
  ]
  loop
    execute format('drop policy if exists "service role %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "service role %s" on public.%I for all to service_role using (true) with check (true)',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Realtime은 웹 승인함과 채널 상태 동기화에 필요한 테이블만 추가한다.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'assistant_channel_connections',
    'assistant_conversations',
    'assistant_action_requests',
    'assistant_confirmations',
    'assistant_notification_settings'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
