-- Olivia 대화형 업무 비서 2차
-- 기존 채팅 메시지에 업무 카드의 최소 참조 정보만 추가합니다.

alter table public.olivia_chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.olivia_chat_messages.metadata is
  '채팅 업무 카드 참조 ID와 축약 상태. 개인정보 전문과 원본 문서는 저장하지 않는다.';
