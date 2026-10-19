create extension if not exists pgcrypto;

create table if not exists public.person_select_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.person_select_events add column if not exists updated_at timestamptz not null default now();
alter table public.person_select_events add column if not exists slug text;
alter table public.person_select_events add column if not exists title text not null default '';
alter table public.person_select_events add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.person_select_events add column if not exists categories jsonb not null default '[]'::jsonb;
alter table public.person_select_events add column if not exists retouch_options jsonb not null default '[]'::jsonb;
alter table public.person_select_events add column if not exists memo_max integer not null default 300;
alter table public.person_select_events add column if not exists deadline_at timestamptz;
alter table public.person_select_events add column if not exists status text not null default 'draft';
alter table public.person_select_events alter column slug set not null;
alter table public.person_select_events alter column deadline_at set not null;
create unique index if not exists person_select_events_slug_idx on public.person_select_events(slug);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'person_select_events_status_check') then
    alter table public.person_select_events add constraint person_select_events_status_check check (status in ('draft','open','closed'));
  end if;
end $$;

create table if not exists public.person_select_people (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.person_select_people add column if not exists updated_at timestamptz not null default now();
alter table public.person_select_people add column if not exists event_id uuid references public.person_select_events(id) on delete cascade;
alter table public.person_select_people add column if not exists display_name text not null default '';
alter table public.person_select_people add column if not exists login_name text not null default '';
alter table public.person_select_people add column if not exists pin_code text not null default '';
alter table public.person_select_people add column if not exists group_label text;
alter table public.person_select_people add column if not exists first_seen_at timestamptz;
alter table public.person_select_people add column if not exists last_seen_at timestamptz;
alter table public.person_select_people add column if not exists submitted_at timestamptz;
alter table public.person_select_people alter column event_id set not null;
-- 동명이인은 이름과 각자 받은 PIN의 조합으로 로그인한다. 이름만 unique로 두면
-- 동명이인 두 명을 행사에 등록할 수 없으므로 기존 인덱스가 있으면 교체한다.
drop index if exists public.person_select_people_event_login_idx;
create unique index if not exists person_select_people_event_pin_idx on public.person_select_people(event_id, pin_code);

create table if not exists public.person_select_images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.person_select_images add column if not exists event_id uuid references public.person_select_events(id) on delete cascade;
alter table public.person_select_images add column if not exists category_key text not null default '';
alter table public.person_select_images add column if not exists owner_person_id uuid references public.person_select_people(id) on delete set null;
alter table public.person_select_images add column if not exists owner_group text;
alter table public.person_select_images add column if not exists original_file_name text not null default '';
alter table public.person_select_images add column if not exists source_rel_path text not null default '';
alter table public.person_select_images add column if not exists thumb_path text not null default '';
alter table public.person_select_images add column if not exists preview_path text not null default '';
alter table public.person_select_images add column if not exists width integer;
alter table public.person_select_images add column if not exists height integer;
alter table public.person_select_images add column if not exists sort_order integer not null default 0;
alter table public.person_select_images alter column event_id set not null;
create unique index if not exists person_select_images_event_path_idx on public.person_select_images(event_id, source_rel_path);
create index if not exists person_select_images_person_idx on public.person_select_images(event_id, category_key, owner_person_id);
create index if not exists person_select_images_group_idx on public.person_select_images(event_id, category_key, owner_group);

create table if not exists public.person_select_choices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.person_select_choices add column if not exists updated_at timestamptz not null default now();
alter table public.person_select_choices add column if not exists event_id uuid references public.person_select_events(id) on delete cascade;
alter table public.person_select_choices add column if not exists person_id uuid references public.person_select_people(id) on delete cascade;
alter table public.person_select_choices add column if not exists category_key text not null default '';
alter table public.person_select_choices add column if not exists image_id uuid references public.person_select_images(id) on delete restrict;
alter table public.person_select_choices add column if not exists retouch_keys jsonb not null default '[]'::jsonb;
alter table public.person_select_choices add column if not exists memo text not null default '';
alter table public.person_select_choices alter column event_id set not null;
alter table public.person_select_choices alter column person_id set not null;
alter table public.person_select_choices alter column image_id set not null;
create unique index if not exists person_select_choices_person_category_idx on public.person_select_choices(person_id, category_key);
create index if not exists person_select_choices_event_idx on public.person_select_choices(event_id);

create table if not exists public.person_select_choice_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  choice_id uuid,
  person_id uuid,
  category_key text,
  image_id uuid,
  retouch_keys jsonb,
  memo text,
  action text not null
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'person_select_choice_history_action_check') then
    alter table public.person_select_choice_history add constraint person_select_choice_history_action_check check (action in ('save', 'submit', 'admin_edit'));
  end if;
end $$;

create table if not exists public.person_select_login_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_slug text not null,
  ip_hash text not null,
  succeeded boolean not null default false
);
create index if not exists person_select_login_attempts_limit_idx on public.person_select_login_attempts(event_slug, ip_hash, created_at);

alter table public.person_select_events enable row level security;
alter table public.person_select_people enable row level security;
alter table public.person_select_images enable row level security;
alter table public.person_select_choices enable row level security;
alter table public.person_select_choice_history enable row level security;
alter table public.person_select_login_attempts enable row level security;

do $$ declare t text; begin
  foreach t in array array['person_select_events','person_select_people','person_select_images','person_select_choices','person_select_choice_history','person_select_login_attempts'] loop
    execute format('drop policy if exists "service role full access %s" on public.%I', t, t);
    execute format('create policy "service role full access %s" on public.%I for all to service_role using (true) with check (true)', t, t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-select', 'person-select', false, 10485760, array['image/jpeg'])
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';
