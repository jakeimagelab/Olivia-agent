alter table public.quotes
  add column if not exists approved_at timestamptz;

-- 통합 대화는 고객 없음(client_id is null), 고객 전용 대화는 고객별로 하나씩 유지한다.
drop index if exists public.assistant_conversations_owner_active_unique;

create unique index if not exists assistant_conversations_owner_global_active_unique
  on public.assistant_conversations (owner_id)
  where status = 'active' and client_id is null;

create unique index if not exists assistant_conversations_owner_client_active_unique
  on public.assistant_conversations (owner_id, client_id)
  where status = 'active' and client_id is not null;
