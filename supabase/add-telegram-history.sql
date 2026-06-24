-- 텔레그램 대화 기억을 위한 테이블/컬럼 추가
-- Supabase Dashboard > SQL Editor에서 실행

-- 테이블이 없으면 새로 생성
create table if not exists public.olivia_chat_messages (
  id         uuid default gen_random_uuid() primary key,
  role       text not null,          -- 'user' | 'assistant'
  content    text not null,
  source     text default 'web',     -- 'web' | 'telegram'
  chat_id    text,                   -- 텔레그램 chat_id
  created_at timestamptz default now()
);

-- 이미 테이블이 있으면 chat_id 컬럼만 추가
alter table public.olivia_chat_messages
  add column if not exists chat_id text;

-- 조회 속도를 위한 인덱스
create index if not exists olivia_chat_messages_chat_id_idx
  on public.olivia_chat_messages (chat_id, created_at desc);

-- 오래된 메시지 자동 삭제 (30일 이상) — 선택 사항
-- delete from public.olivia_chat_messages
--   where created_at < now() - interval '30 days';
