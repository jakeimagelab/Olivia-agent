-- Olivia Agent 2.0 conversation context. Safe to apply repeatedly.
alter table public.assistant_conversations
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists project_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists openai_conversation_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists assistant_conversations_context_idx
  on public.assistant_conversations(owner_id, client_id, project_id, updated_at desc);

create unique index if not exists assistant_conversations_openai_id_unique
  on public.assistant_conversations(openai_conversation_id)
  where openai_conversation_id is not null;

comment on column public.assistant_conversations.metadata is
  'Olivia Agent 2.0 UI/context metadata. Rich message blocks remain in olivia_chat_messages.metadata.blocks.';
