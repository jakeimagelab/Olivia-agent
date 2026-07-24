-- PCRM 2차 협업 기능: 촬영 준비, 콘티 피드백, 문의, 첨부파일
-- 기존 PCRM foundation을 보존하는 additive migration이다.

create table if not exists public.pcrm_preparation_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  item_key text not null,
  title text not null,
  description text not null default '',
  input_type text not null default 'text'
    check (input_type in ('text', 'textarea', 'boolean', 'date', 'list', 'file')),
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'draft', 'submitted', 'confirmed', 'revision_requested')),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, item_key)
);

create table if not exists public.pcrm_conti_scene_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  conti_id uuid not null,
  scene_key text not null,
  scene_index integer not null default 0,
  scene_title text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'commented', 'revision_requested', 'resolved')),
  feedback text not null default '',
  admin_reply text not null default '',
  submitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, conti_id, scene_key)
);

create table if not exists public.pcrm_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  category text not null default 'other'
    check (category in ('schedule', 'quote', 'contract', 'preparation', 'conti', 'gallery', 'revision', 'delivery', 'other')),
  title text not null,
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_by text not null default 'client'
    check (created_by in ('client', 'admin')),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcrm_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.pcrm_inquiries(id) on delete cascade,
  author_type text not null check (author_type in ('client', 'admin')),
  author_name text not null default '',
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pcrm_attachments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('preparation', 'conti_feedback', 'inquiry_message')),
  entity_id uuid not null,
  uploaded_by text not null check (uploaded_by in ('client', 'admin')),
  storage_bucket text not null default 'pcrm-attachments',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_pcrm_preparation_project
  on public.pcrm_preparation_items(workflow_run_id, is_active, sort_order);
create index if not exists idx_pcrm_conti_feedback_project
  on public.pcrm_conti_scene_feedback(workflow_run_id, conti_id, updated_at desc);
create index if not exists idx_pcrm_inquiries_project
  on public.pcrm_inquiries(workflow_run_id, status, last_message_at desc);
create index if not exists idx_pcrm_inquiry_messages_inquiry
  on public.pcrm_inquiry_messages(inquiry_id, created_at);
create index if not exists idx_pcrm_attachments_entity
  on public.pcrm_attachments(entity_type, entity_id, created_at);

drop trigger if exists pcrm_preparation_items_updated_at on public.pcrm_preparation_items;
create trigger pcrm_preparation_items_updated_at
  before update on public.pcrm_preparation_items
  for each row execute procedure public.set_updated_at();

drop trigger if exists pcrm_conti_scene_feedback_updated_at on public.pcrm_conti_scene_feedback;
create trigger pcrm_conti_scene_feedback_updated_at
  before update on public.pcrm_conti_scene_feedback
  for each row execute procedure public.set_updated_at();

drop trigger if exists pcrm_inquiries_updated_at on public.pcrm_inquiries;
create trigger pcrm_inquiries_updated_at
  before update on public.pcrm_inquiries
  for each row execute procedure public.set_updated_at();

alter table public.pcrm_preparation_items enable row level security;
alter table public.pcrm_conti_scene_feedback enable row level security;
alter table public.pcrm_inquiries enable row level security;
alter table public.pcrm_inquiry_messages enable row level security;
alter table public.pcrm_attachments enable row level security;

drop policy if exists "service role pcrm preparation" on public.pcrm_preparation_items;
create policy "service role pcrm preparation" on public.pcrm_preparation_items
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm conti feedback" on public.pcrm_conti_scene_feedback;
create policy "service role pcrm conti feedback" on public.pcrm_conti_scene_feedback
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm inquiries" on public.pcrm_inquiries;
create policy "service role pcrm inquiries" on public.pcrm_inquiries
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm inquiry messages" on public.pcrm_inquiry_messages;
create policy "service role pcrm inquiry messages" on public.pcrm_inquiry_messages
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm attachments" on public.pcrm_attachments;
create policy "service role pcrm attachments" on public.pcrm_attachments
  for all to service_role using (true) with check (true);

grant all on table public.pcrm_preparation_items to service_role;
grant all on table public.pcrm_conti_scene_feedback to service_role;
grant all on table public.pcrm_inquiries to service_role;
grant all on table public.pcrm_inquiry_messages to service_role;
grant all on table public.pcrm_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('pcrm-attachments', 'pcrm-attachments', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

notify pgrst, 'reload schema';
