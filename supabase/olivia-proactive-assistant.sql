-- Olivia 능동형 AI 비서 1차
-- 기존 워크플로우 스키마를 변경하지 않는 additive migration입니다.

alter table public.workflow_runs
  add column if not exists preparation_data jsonb not null default '{}'::jsonb,
  add column if not exists work_progress jsonb not null default '{}'::jsonb,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists next_action_owner text default 'representative',
  add column if not exists next_action_source text default 'manual',
  add column if not exists next_action_updated_at timestamptz;

create table if not exists public.olivia_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_source text not null default 'system',
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  actor_type text not null default 'system'
    check (actor_type in ('system','admin','client','staff','local_agent')),
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  event_status text not null default 'pending'
    check (event_status in ('pending','processing','processed','ignored','failed')),
  deduplication_key text,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.olivia_insights (
  id uuid primary key default gen_random_uuid(),
  insight_type text not null
    check (insight_type in (
      'risk','delay','missing_data','customer_waiting','approval_waiting',
      'commitment','opportunity','marketing','recommendation','summary'
    )),
  title text not null,
  summary text not null default '',
  reason text not null default '',
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  event_id uuid references public.olivia_events(id) on delete set null,
  priority_score integer not null default 0 check (priority_score between 0 and 100),
  urgency_score integer not null default 0 check (urgency_score between 0 and 100),
  impact_score integer not null default 0 check (impact_score between 0 and 100),
  confidence numeric not null default 0 check (confidence between 0 and 1),
  recommended_action text default '',
  recommended_due_at timestamptz,
  status text not null default 'open'
    check (status in ('open','acknowledged','action_created','resolved','dismissed')),
  deduplication_key text,
  snoozed_until timestamptz,
  dismissed_reason text default '',
  last_checked_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.olivia_actions (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid references public.olivia_insights(id) on delete set null,
  event_id uuid references public.olivia_events(id) on delete set null,
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text default '',
  action_payload jsonb not null default '{}'::jsonb,
  permission_level text not null default 'review_required'
    check (permission_level in ('auto','review_required','owner_only')),
  status text not null default 'suggested'
    check (status in (
      'suggested','prepared','waiting_approval','approved','running',
      'completed','failed','dismissed'
    )),
  agent_task_id uuid references public.agent_tasks(id) on delete set null,
  approval_id uuid references public.agent_approvals(id) on delete set null,
  deduplication_key text,
  due_at timestamptz,
  executed_at timestamptz,
  result_data jsonb not null default '{}'::jsonb,
  error_message text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_commitments (
  id uuid primary key default gen_random_uuid(),
  consultation_memo_id uuid,
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  owner_type text not null
    check (owner_type in ('representative','client','staff','unknown')),
  owner_name text default '',
  commitment text not null,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open','completed','canceled','overdue')),
  source_text text default '',
  confidence numeric not null default 0 check (confidence between 0 and 1),
  deduplication_key text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.olivia_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_type text not null
    check (briefing_type in ('morning','evening','weekly','meeting_pre','meeting_post')),
  briefing_date date not null,
  title text not null,
  summary text not null default '',
  sections jsonb not null default '[]'::jsonb,
  source_data jsonb not null default '{}'::jsonb,
  status text not null default 'generated'
    check (status in ('generated','viewed','archived')),
  generated_at timestamptz not null default now(),
  viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.olivia_notification_history (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null,
  notification_type text not null,
  client_id uuid,
  project_id uuid,
  workflow_run_id uuid references public.workflow_runs(id) on delete cascade,
  insight_id uuid references public.olivia_insights(id) on delete set null,
  channel text not null default 'dashboard',
  title text not null,
  message text not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.olivia_feedback (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid references public.olivia_insights(id) on delete cascade,
  action_id uuid references public.olivia_actions(id) on delete set null,
  feedback_type text not null
    check (feedback_type in (
      'approved','edited_approved','rejected','dismissed','snoozed','handled_manually'
    )),
  original_content jsonb not null default '{}'::jsonb,
  edited_content jsonb not null default '{}'::jsonb,
  reason text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_olivia_events_status
  on public.olivia_events(event_status, occurred_at);
create index if not exists idx_olivia_events_workflow
  on public.olivia_events(workflow_run_id, occurred_at desc);
create unique index if not exists idx_olivia_events_dedupe
  on public.olivia_events(deduplication_key)
  where deduplication_key is not null;

create index if not exists idx_olivia_insights_open_priority
  on public.olivia_insights(priority_score desc, detected_at desc)
  where status in ('open','acknowledged','action_created');
create index if not exists idx_olivia_insights_workflow
  on public.olivia_insights(workflow_run_id, detected_at desc);
create unique index if not exists idx_olivia_insights_dedupe
  on public.olivia_insights(deduplication_key);

create index if not exists idx_olivia_actions_status
  on public.olivia_actions(status, due_at, created_at desc);
create index if not exists idx_olivia_actions_workflow
  on public.olivia_actions(workflow_run_id, created_at desc);
create unique index if not exists idx_olivia_actions_dedupe
  on public.olivia_actions(deduplication_key);

create index if not exists idx_meeting_commitments_due
  on public.meeting_commitments(status, due_at)
  where status in ('open','overdue');
create index if not exists idx_meeting_commitments_workflow
  on public.meeting_commitments(workflow_run_id, created_at desc);
create unique index if not exists idx_meeting_commitments_dedupe
  on public.meeting_commitments(deduplication_key);

create unique index if not exists idx_olivia_briefings_unique
  on public.olivia_briefings(briefing_type, briefing_date, title);
create index if not exists idx_olivia_briefings_latest
  on public.olivia_briefings(briefing_type, briefing_date desc);

create unique index if not exists idx_olivia_notification_key
  on public.olivia_notification_history(notification_key);
create index if not exists idx_olivia_notification_expiry
  on public.olivia_notification_history(expires_at)
  where expires_at is not null;

create index if not exists idx_olivia_feedback_insight
  on public.olivia_feedback(insight_id, created_at desc);
create index if not exists idx_olivia_feedback_action
  on public.olivia_feedback(action_id, created_at desc);

create or replace function public.upsert_olivia_insight(p_insight jsonb)
returns setof public.olivia_insights
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.olivia_insights (
    insight_type, title, summary, reason, client_id, project_id,
    workflow_run_id, event_id, priority_score, urgency_score,
    impact_score, confidence, recommended_action, recommended_due_at,
    deduplication_key, last_checked_at
  ) values (
    p_insight->>'insight_type',
    p_insight->>'title',
    coalesce(p_insight->>'summary', ''),
    coalesce(p_insight->>'reason', ''),
    nullif(p_insight->>'client_id', '')::uuid,
    nullif(p_insight->>'project_id', '')::uuid,
    nullif(p_insight->>'workflow_run_id', '')::uuid,
    nullif(p_insight->>'event_id', '')::uuid,
    coalesce((p_insight->>'priority_score')::integer, 0),
    coalesce((p_insight->>'urgency_score')::integer, 0),
    coalesce((p_insight->>'impact_score')::integer, 0),
    coalesce((p_insight->>'confidence')::numeric, 0),
    coalesce(p_insight->>'recommended_action', ''),
    nullif(p_insight->>'recommended_due_at', '')::timestamptz,
    p_insight->>'deduplication_key',
    now()
  )
  on conflict (deduplication_key) do update set
    title = excluded.title,
    summary = excluded.summary,
    reason = excluded.reason,
    priority_score = greatest(public.olivia_insights.priority_score, excluded.priority_score),
    urgency_score = greatest(public.olivia_insights.urgency_score, excluded.urgency_score),
    impact_score = greatest(public.olivia_insights.impact_score, excluded.impact_score),
    confidence = greatest(public.olivia_insights.confidence, excluded.confidence),
    recommended_action = excluded.recommended_action,
    recommended_due_at = excluded.recommended_due_at,
    last_checked_at = now(),
    occurrence_count = public.olivia_insights.occurrence_count + 1,
    updated_at = now()
  returning *;
end;
$$;

revoke all on function public.upsert_olivia_insight(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_olivia_insight(jsonb) to service_role;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists olivia_insights_updated_at on public.olivia_insights;
create trigger olivia_insights_updated_at
  before update on public.olivia_insights
  for each row execute procedure public.set_updated_at();

drop trigger if exists olivia_actions_updated_at on public.olivia_actions;
create trigger olivia_actions_updated_at
  before update on public.olivia_actions
  for each row execute procedure public.set_updated_at();

drop trigger if exists meeting_commitments_updated_at on public.meeting_commitments;
create trigger meeting_commitments_updated_at
  before update on public.meeting_commitments
  for each row execute procedure public.set_updated_at();

alter table public.olivia_events enable row level security;
alter table public.olivia_insights enable row level security;
alter table public.olivia_actions enable row level security;
alter table public.meeting_commitments enable row level security;
alter table public.olivia_briefings enable row level security;
alter table public.olivia_notification_history enable row level security;
alter table public.olivia_feedback enable row level security;

drop policy if exists "service role olivia_events" on public.olivia_events;
create policy "service role olivia_events" on public.olivia_events
  for all to service_role using (true) with check (true);
drop policy if exists "service role olivia_insights" on public.olivia_insights;
create policy "service role olivia_insights" on public.olivia_insights
  for all to service_role using (true) with check (true);
drop policy if exists "service role olivia_actions" on public.olivia_actions;
create policy "service role olivia_actions" on public.olivia_actions
  for all to service_role using (true) with check (true);
drop policy if exists "service role meeting_commitments" on public.meeting_commitments;
create policy "service role meeting_commitments" on public.meeting_commitments
  for all to service_role using (true) with check (true);
drop policy if exists "service role olivia_briefings" on public.olivia_briefings;
create policy "service role olivia_briefings" on public.olivia_briefings
  for all to service_role using (true) with check (true);
drop policy if exists "service role olivia_notification_history" on public.olivia_notification_history;
create policy "service role olivia_notification_history" on public.olivia_notification_history
  for all to service_role using (true) with check (true);
drop policy if exists "service role olivia_feedback" on public.olivia_feedback;
create policy "service role olivia_feedback" on public.olivia_feedback
  for all to service_role using (true) with check (true);
