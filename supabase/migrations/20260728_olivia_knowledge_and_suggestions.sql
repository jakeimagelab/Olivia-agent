-- Olivia 지식 패치 시스템 + 마케팅 AI 액션 제안. 9.1(marketing_action_suggestions)은
-- 9.2(olivia_knowledge_patches)를 근거 데이터로 참조하므로 9.2를 먼저 만든다.
-- Phase 1 마케팅 플랜 테이블(marketing_strategies 등)은 건드리지 않는 additive migration이다.

create table if not exists public.olivia_knowledge_patches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);

create index if not exists idx_olivia_knowledge_patches_active_category
  on public.olivia_knowledge_patches(is_active, category, created_at desc);

create table if not exists public.marketing_action_suggestions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.marketing_strategies(id) on delete cascade,
  suggested_title text not null,
  suggested_description text not null default '',
  rationale text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_action_suggestions_strategy_id
  on public.marketing_action_suggestions(strategy_id);

alter table public.olivia_knowledge_patches enable row level security;
alter table public.marketing_action_suggestions enable row level security;

drop policy if exists "service role olivia knowledge patches" on public.olivia_knowledge_patches;
create policy "service role olivia knowledge patches"
  on public.olivia_knowledge_patches for all to service_role
  using (true) with check (true);

drop policy if exists "service role marketing action suggestions" on public.marketing_action_suggestions;
create policy "service role marketing action suggestions"
  on public.marketing_action_suggestions for all to service_role
  using (true) with check (true);

grant all on table public.olivia_knowledge_patches to service_role;
grant all on table public.marketing_action_suggestions to service_role;

notify pgrst, 'reload schema';
