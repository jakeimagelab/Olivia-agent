-- Telegram, Olivia Desktop, Olivia Mobile이 대표자별 active conversation 한 건을 공유한다.
-- 별도 channel message/conversation 테이블은 만들지 않는다.

-- 이전 경합으로 active conversation이 여러 개라면 메시지가 가장 최근인 한 건만 유지한다.
-- 나머지는 삭제하지 않고 archive해 기존 history를 보존한다.
with ranked_active as (
  select
    id,
    row_number() over (
      partition by owner_id
      order by last_message_at desc nulls last, created_at desc, id desc
    ) as active_rank
  from public.assistant_conversations
  where status = 'active'
)
update public.assistant_conversations as conversation
set status = 'archived', updated_at = now()
from ranked_active
where conversation.id = ranked_active.id
  and ranked_active.active_rank > 1;

create unique index if not exists assistant_conversations_owner_active_unique
  on public.assistant_conversations(owner_id)
  where status = 'active';

-- canonical history 조회는 owner/conversation을 항상 함께 제한하고 최신 N건을 읽는다.
create index if not exists olivia_chat_messages_owner_conversation_created_idx
  on public.olivia_chat_messages(owner_id, conversation_id, created_at desc, id desc);

-- 기존 외부 메시지 unique index가 webhook duplicate를 차단한다. 환경별 이전 migration
-- 누락에도 안전하도록 같은 정의를 반복 보장한다.
create unique index if not exists olivia_chat_messages_external_unique
  on public.olivia_chat_messages(channel, external_message_id)
  where external_message_id is not null;

-- 메시지를 브라우저가 직접 구독하면 payload가 노출될 수 있으므로 service role 전용으로 잠근다.
-- Web chat은 인증된 서버 SSE에서 INSERT 변경 신호만 받고, 실제 message도 인증된 API로 다시 읽는다.
alter table public.olivia_chat_messages enable row level security;
drop policy if exists "service role olivia_chat_messages" on public.olivia_chat_messages;
create policy "service role olivia_chat_messages"
  on public.olivia_chat_messages
  for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.olivia_chat_messages from anon, authenticated;
grant select, insert, update, delete on table public.olivia_chat_messages to service_role;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'olivia_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.olivia_chat_messages';
  end if;
end $$;

notify pgrst, 'reload schema';
