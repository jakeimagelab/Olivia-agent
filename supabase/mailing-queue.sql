-- 올리비아 통합 메일링 큐
create table if not exists public.mailing_queue (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('quote','contract','conti','proposal','original_files','gallery','review_form','monthly_report')),
  source_module  text not null default '',
  source_id      text default '',
  hospital_name  text not null default '',
  contact_name   text default '',
  to_email       text default '',
  subject        text not null default '',
  body           text not null default '',
  attachments    jsonb not null default '[]'::jsonb,
  links          jsonb not null default '[]'::jsonb,
  status         text not null default 'draft' check (status in ('draft','ready','sent','failed')),
  error_message  text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  sent_at        timestamptz
);

create table if not exists public.mailing_logs (
  id          uuid primary key default gen_random_uuid(),
  queue_id    uuid references public.mailing_queue(id) on delete set null,
  type        text not null default '',
  hospital_name text not null default '',
  to_email    text not null default '',
  subject     text not null default '',
  status      text not null default 'sent' check (status in ('sent','failed')),
  error       text default '',
  sent_at     timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists mailing_queue_updated_at on public.mailing_queue;
create trigger mailing_queue_updated_at
  before update on public.mailing_queue
  for each row execute procedure public.set_updated_at();

-- RLS 비활성화 (서버-사이드 service role 사용)
alter table public.mailing_queue enable row level security;
alter table public.mailing_logs  enable row level security;

-- service role 접근 허용
create policy "service role full access mailing_queue"
  on public.mailing_queue for all
  using (true) with check (true);

create policy "service role full access mailing_logs"
  on public.mailing_logs for all
  using (true) with check (true);
