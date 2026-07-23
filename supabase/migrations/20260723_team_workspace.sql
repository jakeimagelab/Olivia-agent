-- Olivia 팀 워크스페이스
-- 기존 팀채팅/agent_tasks를 변경하거나 재생성하지 않는 additive migration.

alter table public.chat_members
  add column if not exists is_admin boolean not null default false;

create table if not exists public.team_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  project_type text not null default 'internal',
  status text not null default 'planning',
  priority text not null default 'normal',
  client_id uuid,
  workflow_run_id uuid,
  owner_id uuid references public.chat_members(id) on delete set null,
  created_by uuid not null references public.chat_members(id),
  start_date date,
  due_date date,
  completed_at timestamptz,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_projects_name_length check (char_length(name) between 1 and 200),
  constraint team_projects_type_check check (
    project_type in ('photo', 'film', 'web', 'ai_system', 'branding', 'marketing', 'internal')
  ),
  constraint team_projects_status_check check (
    status in ('planning', 'active', 'on_hold', 'completed', 'canceled')
  ),
  constraint team_projects_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint team_projects_progress_check check (progress between 0 and 100),
  constraint team_projects_date_order check (start_date is null or due_date is null or start_date <= due_date)
);

create table if not exists public.project_members (
  project_id uuid not null references public.team_projects(id) on delete cascade,
  member_id uuid not null references public.chat_members(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (project_id, member_id),
  constraint project_members_role_check check (role in ('owner', 'manager', 'member', 'viewer'))
);

alter table public.chat_rooms
  add column if not exists room_type text not null default 'general',
  add column if not exists project_id uuid references public.team_projects(id) on delete set null,
  add column if not exists client_id uuid,
  add column if not exists is_announcement boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_rooms_room_type_check'
      and conrelid = 'public.chat_rooms'::regclass
  ) then
    alter table public.chat_rooms
      add constraint chat_rooms_room_type_check
      check (room_type in ('general', 'project', 'announcement', 'direct'));
  end if;
end $$;

alter table public.chat_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.team_projects(id) on delete set null,
  room_id uuid references public.chat_rooms(id) on delete set null,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  title text not null,
  description text,
  assignee_id uuid references public.chat_members(id) on delete set null,
  created_by uuid not null references public.chat_members(id),
  priority text not null default 'normal',
  status text not null default 'todo',
  start_date date,
  due_date date,
  submitted_at timestamptz,
  completed_at timestamptz,
  approved_by uuid references public.chat_members(id) on delete set null,
  approved_at timestamptz,
  revision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_tasks_title_length check (char_length(title) between 1 and 200),
  constraint team_tasks_description_length check (description is null or char_length(description) <= 10000),
  constraint team_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint team_tasks_status_check check (
    status in ('todo', 'in_progress', 'review', 'completed', 'on_hold', 'canceled')
  ),
  constraint team_tasks_revision_note_length check (revision_note is null or char_length(revision_note) between 1 and 2000),
  constraint team_tasks_date_order check (start_date is null or due_date is null or start_date <= due_date)
);

create table if not exists public.team_task_checklists (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  content text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_task_checklists_content_length check (char_length(content) between 1 and 500)
);

create table if not exists public.team_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  uploaded_by uuid not null references public.chat_members(id),
  drive_file_id text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.chat_members(id) on delete cascade,
  goal_date date not null default current_date,
  title text not null,
  success_criteria text,
  status text not null default 'planned',
  result_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, goal_date),
  constraint daily_goals_title_length check (char_length(title) between 1 and 200),
  constraint daily_goals_status_check check (status in ('planned', 'achieved', 'partial', 'missed')),
  constraint daily_goals_result_note_length check (result_note is null or char_length(result_note) <= 2000)
);

create table if not exists public.team_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  actor_id uuid references public.chat_members(id) on delete set null,
  event_type text not null,
  from_value text,
  to_value text,
  note text,
  created_at timestamptz not null default now(),
  constraint team_task_events_type_check check (
    event_type in (
      'created', 'assigned', 'status_changed', 'submitted', 'approved',
      'revision_requested', 'due_date_changed', 'commented', 'attachment_added'
    )
  )
);

-- FK/RLS/목록 조회에 쓰이는 컬럼은 Postgres가 자동 인덱싱하지 않으므로 명시한다.
create index if not exists team_projects_owner_idx on public.team_projects(owner_id);
create index if not exists team_projects_created_by_idx on public.team_projects(created_by);
create index if not exists team_projects_status_due_idx on public.team_projects(status, due_date);
create index if not exists project_members_member_idx on public.project_members(member_id, project_id);
create unique index if not exists chat_rooms_project_room_unique
  on public.chat_rooms(project_id) where project_id is not null and room_type = 'project';
create index if not exists chat_rooms_project_idx on public.chat_rooms(project_id);
create index if not exists team_tasks_project_status_idx on public.team_tasks(project_id, status);
create index if not exists team_tasks_assignee_status_due_idx on public.team_tasks(assignee_id, status, due_date);
create index if not exists team_tasks_created_by_idx on public.team_tasks(created_by);
create index if not exists team_tasks_room_idx on public.team_tasks(room_id);
create index if not exists team_tasks_source_message_idx on public.team_tasks(source_message_id);
create index if not exists team_task_checklists_task_idx on public.team_task_checklists(task_id, sort_order);
create index if not exists team_task_attachments_task_idx on public.team_task_attachments(task_id, created_at);
create index if not exists daily_goals_date_member_idx on public.daily_goals(goal_date, member_id);
create index if not exists team_task_events_task_created_idx on public.team_task_events(task_id, created_at desc);
create index if not exists chat_messages_task_event_idx
  on public.chat_messages ((metadata->>'taskId'))
  where metadata->>'messageType' = 'task_event';

-- RLS의 재귀를 피하기 위한 읽기 전용 SECURITY DEFINER 헬퍼.
create or replace function public.is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_members
    where id = (select auth.uid()) and is_admin = true
  );
$$;

create or replace function public.can_access_team_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_admin() or exists (
    select 1
    from public.team_projects p
    where p.id = p_project_id
      and (
        p.created_by = (select auth.uid())
        or p.owner_id = (select auth.uid())
        or exists (
          select 1 from public.project_members pm
          where pm.project_id = p.id and pm.member_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_access_team_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_team_admin() or exists (
    select 1
    from public.team_tasks t
    where t.id = p_task_id
      and (
        t.assignee_id = (select auth.uid())
        or t.created_by = (select auth.uid())
        or (t.project_id is not null and public.can_access_team_project(t.project_id))
        or (t.room_id is not null and public.is_chat_room_member(t.room_id))
      )
  );
$$;

alter table public.team_projects enable row level security;
alter table public.project_members enable row level security;
alter table public.team_tasks enable row level security;
alter table public.team_task_checklists enable row level security;
alter table public.team_task_attachments enable row level security;
alter table public.daily_goals enable row level security;
alter table public.team_task_events enable row level security;

drop policy if exists "service role full access team_projects" on public.team_projects;
create policy "service role full access team_projects" on public.team_projects
  for all to service_role using (true) with check (true);
drop policy if exists "members read accessible team_projects" on public.team_projects;
create policy "members read accessible team_projects" on public.team_projects
  for select to authenticated using (public.can_access_team_project(id));
drop policy if exists "members create team_projects" on public.team_projects;
create policy "members create team_projects" on public.team_projects
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "managers update team_projects" on public.team_projects;
create policy "managers update team_projects" on public.team_projects
  for update to authenticated
  using (
    public.is_team_admin()
    or created_by = (select auth.uid())
    or owner_id = (select auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = id
        and pm.member_id = (select auth.uid())
        and pm.role in ('owner', 'manager')
    )
  );

drop policy if exists "service role full access project_members" on public.project_members;
create policy "service role full access project_members" on public.project_members
  for all to service_role using (true) with check (true);
drop policy if exists "members read accessible project roster" on public.project_members;
create policy "members read accessible project roster" on public.project_members
  for select to authenticated using (public.can_access_team_project(project_id));

drop policy if exists "service role full access team_tasks" on public.team_tasks;
create policy "service role full access team_tasks" on public.team_tasks
  for all to service_role using (true) with check (true);
drop policy if exists "members read accessible team_tasks" on public.team_tasks;
create policy "members read accessible team_tasks" on public.team_tasks
  for select to authenticated using (public.can_access_team_task(id));
drop policy if exists "members create team_tasks" on public.team_tasks;
create policy "members create team_tasks" on public.team_tasks
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (project_id is null or public.can_access_team_project(project_id))
    and (room_id is null or public.is_chat_room_member(room_id))
  );
drop policy if exists "members update accessible team_tasks" on public.team_tasks;
create policy "members update accessible team_tasks" on public.team_tasks
  for update to authenticated using (public.can_access_team_task(id));

drop policy if exists "service role full access team_task_checklists" on public.team_task_checklists;
create policy "service role full access team_task_checklists" on public.team_task_checklists
  for all to service_role using (true) with check (true);
drop policy if exists "members access task checklists" on public.team_task_checklists;
create policy "members access task checklists" on public.team_task_checklists
  for all to authenticated
  using (public.can_access_team_task(task_id))
  with check (public.can_access_team_task(task_id));

drop policy if exists "service role full access team_task_attachments" on public.team_task_attachments;
create policy "service role full access team_task_attachments" on public.team_task_attachments
  for all to service_role using (true) with check (true);
drop policy if exists "members read task attachments" on public.team_task_attachments;
create policy "members read task attachments" on public.team_task_attachments
  for select to authenticated using (public.can_access_team_task(task_id));
drop policy if exists "members add task attachments" on public.team_task_attachments;
create policy "members add task attachments" on public.team_task_attachments
  for insert to authenticated with check (
    public.can_access_team_task(task_id) and uploaded_by = (select auth.uid())
  );

drop policy if exists "service role full access daily_goals" on public.daily_goals;
create policy "service role full access daily_goals" on public.daily_goals
  for all to service_role using (true) with check (true);
drop policy if exists "members read own goals and admins read all" on public.daily_goals;
create policy "members read own goals and admins read all" on public.daily_goals
  for select to authenticated
  using (member_id = (select auth.uid()) or public.is_team_admin());
drop policy if exists "members create own daily goals" on public.daily_goals;
create policy "members create own daily goals" on public.daily_goals
  for insert to authenticated with check (member_id = (select auth.uid()));
drop policy if exists "members update own daily goals" on public.daily_goals;
create policy "members update own daily goals" on public.daily_goals
  for update to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

drop policy if exists "service role full access team_task_events" on public.team_task_events;
create policy "service role full access team_task_events" on public.team_task_events
  for all to service_role using (true) with check (true);
drop policy if exists "members read accessible task events" on public.team_task_events;
create policy "members read accessible task events" on public.team_task_events
  for select to authenticated using (public.can_access_team_task(task_id));
drop policy if exists "members create accessible task events" on public.team_task_events;
create policy "members create accessible task events" on public.team_task_events
  for insert to authenticated with check (
    public.can_access_team_task(task_id)
    and (actor_id is null or actor_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.team_projects, public.project_members,
  public.team_tasks, public.team_task_checklists, public.team_task_attachments,
  public.daily_goals, public.team_task_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_projects'
  ) then
    alter publication supabase_realtime add table public.team_projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_tasks'
  ) then
    alter publication supabase_realtime add table public.team_tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_task_checklists'
  ) then
    alter publication supabase_realtime add table public.team_task_checklists;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_goals'
  ) then
    alter publication supabase_realtime add table public.daily_goals;
  end if;
end $$;

notify pgrst, 'reload schema';
