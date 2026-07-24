-- Olivia review → Instagram approval pipeline
-- Additive only: existing delivery_reviews and client_reviews data are preserved.

alter table public.client_reviews
  add column if not exists workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists source_channel text not null default '',
  add column if not exists delivered_at date,
  add column if not exists content_status text not null default 'unused',
  add column if not exists legacy_delivery_review_id uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'client_reviews_source_check'
      and conrelid = 'public.client_reviews'::regclass
  ) then
    alter table public.client_reviews
      add constraint client_reviews_source_check
      check (source in ('manual','client_portal','olivia_chat','legacy'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'client_reviews_content_status_check'
      and conrelid = 'public.client_reviews'::regclass
  ) then
    alter table public.client_reviews
      add constraint client_reviews_content_status_check
      check (content_status in ('unused','candidate','drafted','approved','published','excluded'));
  end if;
end $$;

create unique index if not exists idx_client_reviews_legacy_delivery
  on public.client_reviews(legacy_delivery_review_id)
  where legacy_delivery_review_id is not null;
create index if not exists idx_client_reviews_workflow on public.client_reviews(workflow_run_id);
create index if not exists idx_client_reviews_content_candidate
  on public.client_reviews(content_status, allow_public_use, created_at desc);

drop trigger if exists client_reviews_updated_at on public.client_reviews;
create trigger client_reviews_updated_at
  before update on public.client_reviews
  for each row execute procedure public.set_updated_at();

create table if not exists public.review_layout_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  ratio text not null default '4:5' check (ratio in ('1:1','4:5','9:16')),
  asset_type text not null default 'reference' check (asset_type in ('builtin','reference')),
  reference_storage_path text,
  thumbnail_storage_path text,
  layout_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_contents (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.client_reviews(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid references public.workflow_runs(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','variants_ready','waiting_approval','approved','published','failed')),
  summary text not null default '',
  caption text not null default '',
  hashtags text not null default '',
  carousel jsonb not null default '[]'::jsonb,
  selection_reason text not null default '',
  risk_flags jsonb not null default '[]'::jsonb,
  selected_layout_asset_id uuid references public.review_layout_assets(id) on delete set null,
  selected_variant_id uuid,
  created_by text not null default 'olivia',
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_content_variants (
  id uuid primary key default gen_random_uuid(),
  review_content_id uuid not null references public.review_contents(id) on delete cascade,
  layout_asset_id uuid references public.review_layout_assets(id) on delete set null,
  image_storage_path text not null,
  mime_type text not null default 'image/png',
  width integer not null default 1080 check (width > 0),
  height integer not null default 1350 check (height > 0),
  generation_metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'review_contents_selected_variant_fkey'
      and conrelid = 'public.review_contents'::regclass
  ) then
    alter table public.review_contents
      add constraint review_contents_selected_variant_fkey
      foreign key (selected_variant_id)
      references public.review_content_variants(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'meta' check (provider = 'meta'),
  ig_user_id text not null unique,
  username text not null default '',
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected','expired','revoked','error')),
  connected_by text not null default 'owner',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  review_content_id uuid not null references public.review_contents(id) on delete cascade,
  variant_id uuid not null references public.review_content_variants(id) on delete restrict,
  account_id uuid not null references public.instagram_accounts(id) on delete restrict,
  status text not null default 'waiting_approval'
    check (status in ('waiting_approval','publishing','published','failed','canceled')),
  caption text not null default '',
  idempotency_key text not null unique,
  meta_creation_id text,
  meta_media_id text,
  error_message text,
  retry_count integer not null default 0 check (retry_count between 0 and 5),
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_contents_client on public.review_contents(client_id, created_at desc);
create index if not exists idx_review_contents_status on public.review_contents(status, created_at desc);
create index if not exists idx_review_variants_content on public.review_content_variants(review_content_id, sort_order);
create index if not exists idx_instagram_jobs_status on public.instagram_publish_jobs(status, created_at);

drop trigger if exists review_layout_assets_updated_at on public.review_layout_assets;
create trigger review_layout_assets_updated_at
  before update on public.review_layout_assets
  for each row execute procedure public.set_updated_at();
drop trigger if exists review_contents_updated_at on public.review_contents;
create trigger review_contents_updated_at
  before update on public.review_contents
  for each row execute procedure public.set_updated_at();
drop trigger if exists instagram_accounts_updated_at on public.instagram_accounts;
create trigger instagram_accounts_updated_at
  before update on public.instagram_accounts
  for each row execute procedure public.set_updated_at();
drop trigger if exists instagram_publish_jobs_updated_at on public.instagram_publish_jobs;
create trigger instagram_publish_jobs_updated_at
  before update on public.instagram_publish_jobs
  for each row execute procedure public.set_updated_at();

alter table public.review_layout_assets enable row level security;
alter table public.review_contents enable row level security;
alter table public.review_content_variants enable row level security;
alter table public.instagram_accounts enable row level security;
alter table public.instagram_publish_jobs enable row level security;

insert into storage.buckets (id, name, public)
values ('review-content-assets', 'review-content-assets', false)
on conflict (id) do update set public = excluded.public;

insert into public.review_layout_assets (id, name, description, ratio, asset_type, layout_config, created_by)
values
  ('24072400-0000-4000-8000-000000000001', '사진 상단 + 리뷰 하단', '사진과 리뷰 문구를 균형 있게 배치', '4:5', 'builtin', '{"template":"photo_bottom","background":"#F5F0EB","accent":"#E85D2C"}', 'system'),
  ('24072400-0000-4000-8000-000000000002', '전체 사진 + 그라디언트', '사진 위에 그라디언트와 짧은 리뷰 배치', '4:5', 'builtin', '{"template":"photo_overlay","background":"#155855","accent":"#E85D2C"}', 'system'),
  ('24072400-0000-4000-8000-000000000003', '리뷰 텍스트 카드', '사진 없이 리뷰를 중심으로 구성', '4:5', 'builtin', '{"template":"text_only","background":"#155855","accent":"#EB8F22"}', 'system'),
  ('24072400-0000-4000-8000-000000000004', '포토클리닉 프레임', '브랜드 프레임 안에 리뷰와 병원명 배치', '4:5', 'builtin', '{"template":"frame","background":"#EDF5F3","accent":"#155855"}', 'system'),
  ('24072400-0000-4000-8000-000000000005', '오렌지 포인트 바', '좌측 포인트 바와 리뷰 문구 구성', '4:5', 'builtin', '{"template":"accent_bar","background":"#F5F0EB","accent":"#E85D2C"}', 'system')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  layout_config = excluded.layout_config,
  is_active = true;

-- Backfill legacy delivery reviews only when exactly one client matches.
do $$
begin
  if to_regclass('public.delivery_reviews') is not null then
    execute $backfill$
      insert into public.client_reviews (
        client_id, overall_rating, good_points, public_review_text,
        allow_public_use, writer_name, source, source_channel,
        delivered_at, legacy_delivery_review_id, content_status, created_at
      )
      select
        matched.client_id,
        coalesce(d.rating, 5),
        coalesce(d.review_text, ''),
        coalesce(d.review_text, ''),
        coalesce(d.permission_to_publish, false),
        coalesce(d.reviewer_name, ''),
        'legacy',
        coalesce(d.channel, ''),
        d.delivered_at,
        d.id,
        'unused',
        coalesce(d.created_at, now())
      from public.delivery_reviews d
      join lateral (
        select min(c.id::text)::uuid as client_id
        from public.clients c
        where lower(regexp_replace(coalesce(c.hospital_name, ''), '\s+', '', 'g'))
            = lower(regexp_replace(coalesce(d.hospital_name, ''), '\s+', '', 'g'))
        having count(*) = 1
      ) matched on true
      where not exists (
        select 1 from public.client_reviews r
        where r.legacy_delivery_review_id = d.id
      )
    $backfill$;
  end if;
end $$;

notify pgrst, 'reload schema';
