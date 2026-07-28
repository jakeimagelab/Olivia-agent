-- 마케팅 플랜 비서: 채널 무관 마케팅 전략(가설)/액션(할일)/지표기록을 구조화해서
-- 관리하기 위한 신규 테이블 3종. 기존 테이블은 건드리지 않는 additive migration이다.

create table if not exists public.marketing_strategies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  hypothesis text not null default '',
  channel text not null default '',
  status text not null default 'planned'
    check (status in ('planned', 'active', 'paused', 'completed')),
  start_date date,
  target_end_date date,
  baseline_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_actions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.marketing_strategies(id) on delete cascade,
  title text not null,
  description text not null default '',
  scheduled_date date,
  completed_date date,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'skipped')),
  related_post_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_metric_logs (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.marketing_actions(id) on delete cascade,
  metric_type text not null,
  unit text not null default '',
  value numeric not null default 0,
  recorded_at date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_actions_strategy_id
  on public.marketing_actions(strategy_id);
create index if not exists idx_marketing_actions_scheduled_date
  on public.marketing_actions(scheduled_date);
create index if not exists idx_marketing_metric_logs_action_id
  on public.marketing_metric_logs(action_id);

drop trigger if exists marketing_strategies_updated_at on public.marketing_strategies;
create trigger marketing_strategies_updated_at
  before update on public.marketing_strategies
  for each row execute procedure public.set_updated_at();

alter table public.marketing_strategies enable row level security;
alter table public.marketing_actions enable row level security;
alter table public.marketing_metric_logs enable row level security;

drop policy if exists "service role marketing strategies" on public.marketing_strategies;
create policy "service role marketing strategies"
  on public.marketing_strategies for all to service_role
  using (true) with check (true);

drop policy if exists "service role marketing actions" on public.marketing_actions;
create policy "service role marketing actions"
  on public.marketing_actions for all to service_role
  using (true) with check (true);

drop policy if exists "service role marketing metric logs" on public.marketing_metric_logs;
create policy "service role marketing metric logs"
  on public.marketing_metric_logs for all to service_role
  using (true) with check (true);

grant all on table public.marketing_strategies to service_role;
grant all on table public.marketing_actions to service_role;
grant all on table public.marketing_metric_logs to service_role;

notify pgrst, 'reload schema';
