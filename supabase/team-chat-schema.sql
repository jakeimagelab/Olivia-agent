-- 팀 채팅 (스튜디오 직원 몇 명이 같이 쓰는 실시간 채팅) — Phase 1
-- 올리비아 앱은 단일 테넌트라 workspace_id 없이 설계했다. 여러 번 실행해도 안전한
-- additive migration (create table if not exists / add column if not exists 패턴).
--
-- 다른 테이블들과 달리 이 테이블들은 RLS를 실제로 켠다 — Supabase Realtime의 행 단위
-- 인가가 Postgres에서 접속 JWT(auth.uid()) 기준으로 직접 평가되기 때문에, RLS 없이는
-- 팀원 아무나 다른 사람 방을 실시간 구독으로 엿볼 수 있다.

-- ── 팀원 프로필 (auth.users와 1:1) ──────────────────────────
create table if not exists public.chat_members (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ── 초대 (관리자가 발급, 이메일 발송 없이 링크만 복사해서 전달) ──
create table if not exists public.team_invites (
  token        text primary key,
  email        text not null,
  invited_by   uuid references public.chat_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz
);

-- ── 채팅방 ──────────────────────────────────────────────────
create table if not exists public.chat_rooms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  color           text not null default '#155855',
  created_by      uuid not null references public.chat_members(id),
  drive_folder_id text,
  olivia_enabled  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.chat_room_members (
  room_id   uuid not null references public.chat_rooms(id) on delete cascade,
  member_id uuid not null references public.chat_members(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

-- ── 메시지 (보낸이는 팀원 또는 올리비아 중 정확히 하나) ────────
create table if not exists public.chat_messages (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.chat_rooms(id) on delete cascade,
  sender_type      text not null check (sender_type in ('member', 'olivia')),
  sender_member_id uuid references public.chat_members(id),
  body             text not null default '',
  created_at       timestamptz not null default now(),
  constraint chat_messages_sender_consistency check (
    (sender_type = 'member' and sender_member_id is not null) or
    (sender_type = 'olivia' and sender_member_id is null)
  )
);
create index if not exists chat_messages_room_created_idx on public.chat_messages(room_id, created_at desc);

-- ── 첨부파일 (Google Drive에 저장, 메타데이터만 여기에) ────────
create table if not exists public.chat_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.chat_messages(id) on delete cascade,
  room_id       uuid not null references public.chat_rooms(id) on delete cascade,
  drive_file_id text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index if not exists chat_attachments_room_id_idx on public.chat_attachments(room_id);

-- ── 대표 Google Drive 연결 (스튜디오 전체에 딱 하나, 싱글턴 row) ──
create table if not exists public.chat_drive_connection (
  id                      int primary key default 1 check (id = 1),
  connected_by            uuid references public.chat_members(id),
  google_email            text,
  refresh_token           text not null,
  access_token            text,
  access_token_expires_at timestamptz,
  root_folder_id          text,
  updated_at              timestamptz not null default now()
);

-- ── Realtime: 새 메시지/첨부/방 정보 변경이 실시간으로 전파되게 ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_attachments'
  ) then
    alter publication supabase_realtime add table public.chat_attachments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_rooms'
  ) then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end $$;

-- ── RLS 헬퍼 함수 (SECURITY DEFINER로 재귀 RLS 방지) ───────────
create or replace function public.is_chat_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_room_members
    where room_id = p_room_id and member_id = auth.uid()
  );
$$;

create or replace function public.is_chat_room_creator(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_rooms
    where id = p_room_id and created_by = auth.uid()
  );
$$;

-- ── RLS 활성화 ──────────────────────────────────────────────
alter table public.chat_members           enable row level security;
alter table public.team_invites           enable row level security;
alter table public.chat_rooms             enable row level security;
alter table public.chat_room_members      enable row level security;
alter table public.chat_messages          enable row level security;
alter table public.chat_attachments       enable row level security;
alter table public.chat_drive_connection  enable row level security;

-- chat_members: 로그인한 팀원 누구나 전체 목록 조회 가능(이름/아바타 표시용), 생성/수정은 서비스롤만
drop policy if exists "service role full access chat_members" on public.chat_members;
create policy "service role full access chat_members"
  on public.chat_members for all to service_role using (true) with check (true);

drop policy if exists "members read all chat_members" on public.chat_members;
create policy "members read all chat_members"
  on public.chat_members for select to authenticated using (true);

-- team_invites: 서비스롤 전용 (토큰이 곧 비밀번호 설정 권한이라 클라이언트에 노출 안 함)
drop policy if exists "service role full access team_invites" on public.team_invites;
create policy "service role full access team_invites"
  on public.team_invites for all to service_role using (true) with check (true);

-- chat_drive_connection: 서비스롤 전용 (refresh_token 보관)
drop policy if exists "service role full access chat_drive_connection" on public.chat_drive_connection;
create policy "service role full access chat_drive_connection"
  on public.chat_drive_connection for all to service_role using (true) with check (true);

-- chat_rooms
drop policy if exists "service role full access chat_rooms" on public.chat_rooms;
create policy "service role full access chat_rooms"
  on public.chat_rooms for all to service_role using (true) with check (true);

drop policy if exists "members read own rooms" on public.chat_rooms;
create policy "members read own rooms"
  on public.chat_rooms for select to authenticated
  using (public.is_chat_room_member(id));

drop policy if exists "members create rooms" on public.chat_rooms;
create policy "members create rooms"
  on public.chat_rooms for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "members update own rooms" on public.chat_rooms;
create policy "members update own rooms"
  on public.chat_rooms for update to authenticated
  using (public.is_chat_room_member(id));

-- chat_room_members
drop policy if exists "service role full access chat_room_members" on public.chat_room_members;
create policy "service role full access chat_room_members"
  on public.chat_room_members for all to service_role using (true) with check (true);

drop policy if exists "members read own room roster" on public.chat_room_members;
create policy "members read own room roster"
  on public.chat_room_members for select to authenticated
  using (public.is_chat_room_member(room_id));

drop policy if exists "members add to room" on public.chat_room_members;
create policy "members add to room"
  on public.chat_room_members for insert to authenticated
  with check (public.is_chat_room_member(room_id) or public.is_chat_room_creator(room_id));

-- chat_messages
drop policy if exists "service role full access chat_messages" on public.chat_messages;
create policy "service role full access chat_messages"
  on public.chat_messages for all to service_role using (true) with check (true);

drop policy if exists "members read own room messages" on public.chat_messages;
create policy "members read own room messages"
  on public.chat_messages for select to authenticated
  using (public.is_chat_room_member(room_id));

drop policy if exists "members send own messages" on public.chat_messages;
create policy "members send own messages"
  on public.chat_messages for insert to authenticated
  with check (
    public.is_chat_room_member(room_id)
    and sender_type = 'member'
    and sender_member_id = auth.uid()
  );

-- chat_attachments
drop policy if exists "service role full access chat_attachments" on public.chat_attachments;
create policy "service role full access chat_attachments"
  on public.chat_attachments for all to service_role using (true) with check (true);

drop policy if exists "members read own room attachments" on public.chat_attachments;
create policy "members read own room attachments"
  on public.chat_attachments for select to authenticated
  using (public.is_chat_room_member(room_id));

drop policy if exists "members add attachments to own room" on public.chat_attachments;
create policy "members add attachments to own room"
  on public.chat_attachments for insert to authenticated
  with check (public.is_chat_room_member(room_id));

grant usage on schema public to authenticated;
grant select, insert, update on public.chat_members, public.chat_rooms, public.chat_room_members,
  public.chat_messages, public.chat_attachments to authenticated;

notify pgrst, 'reload schema';
