-- 올리비아 채팅 통합 메시지 (웹 + 텔레그램 대화 동기화)
CREATE TABLE IF NOT EXISTS olivia_chat_messages (
  id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz  DEFAULT NOW(),
  role       text         NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text         NOT NULL,
  source     text         NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'telegram'))
);

CREATE INDEX IF NOT EXISTS olivia_chat_messages_ts_idx
  ON olivia_chat_messages (created_at DESC);

ALTER TABLE olivia_chat_messages DISABLE ROW LEVEL SECURITY;
