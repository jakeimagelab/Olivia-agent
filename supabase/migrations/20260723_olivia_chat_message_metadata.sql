alter table public.olivia_chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_olivia_chat_messages_client_request_id
  on public.olivia_chat_messages ((metadata->>'clientRequestId'))
  where metadata ? 'clientRequestId';

notify pgrst, 'reload schema';
