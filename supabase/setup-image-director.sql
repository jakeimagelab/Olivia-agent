-- generated_images
create table if not exists public.generated_images (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.clients(id) on delete set null,
  mode             text not null default 'real', -- 'real' | 'variation' | 'conti'
  scene_type       text default '',
  department       text default '',
  people_type      text default '',
  age_group        text default '',
  mood             text default '',
  lighting         text default '',
  composition      text default '',
  usage            text default '',
  extra_request    text default '',
  prompt           text not null default '',
  refined_prompt   text default '',
  image_url        text not null default '',
  is_selected      boolean not null default false,
  status           text not null default 'draft' check (status in ('draft','selected','refined','approved','rejected')),
  checklist        jsonb not null default '{}'::jsonb,
  reference_info   jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists generated_images_client_idx on public.generated_images (client_id);
create index if not exists generated_images_created_at_idx on public.generated_images (created_at desc);

alter table public.generated_images enable row level security;
drop policy if exists "service role full access generated_images" on public.generated_images;
create policy "service role full access generated_images"
  on public.generated_images for all to service_role using (true) with check (true);
