-- 고객용 Bridge 셀렉과 관리자 셀렉 비교 (2026-11-06)
-- 기존 classic 공유 링크와 제출 이력은 그대로 유지하고 필요한 필드만 추가한다.

alter table public.select_galleries
  add column if not exists view_mode text not null default 'classic',
  add column if not exists share_token_version integer not null default 1,
  add column if not exists selection_revision integer not null default 0,
  add column if not exists bridge_source text,
  add column if not exists bridge_folder_path text,
  add column if not exists bridge_folder_display_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'select_galleries_view_mode_check') then
    alter table public.select_galleries add constraint select_galleries_view_mode_check
      check (view_mode in ('classic', 'bridge'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'select_galleries_bridge_source_check') then
    alter table public.select_galleries add constraint select_galleries_bridge_source_check
      check (bridge_source is null or bridge_source in ('local', 'remote'));
  end if;
end $$;

alter table public.select_gallery_images
  add column if not exists relative_path text;

create index if not exists select_gallery_images_relative_path_idx
  on public.select_gallery_images (gallery_id, relative_path)
  where relative_path is not null;

alter table public.client_photo_selection_items
  add column if not exists customer_rating smallint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_photo_selection_items_customer_rating_check') then
    alter table public.client_photo_selection_items add constraint client_photo_selection_items_customer_rating_check
      check (customer_rating is null or customer_rating between 1 and 5);
  end if;
end $$;

alter table public.select_raw_matches
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by_selection_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'select_raw_matches_invalidated_selection_fk') then
    alter table public.select_raw_matches add constraint select_raw_matches_invalidated_selection_fk
      foreign key (invalidated_by_selection_id)
      references public.client_photo_selections(id) on delete set null;
  end if;
end $$;

create index if not exists select_raw_matches_valid_gallery_idx
  on public.select_raw_matches (gallery_id, created_at)
  where invalidated_at is null;

create table if not exists public.select_gallery_drafts (
  gallery_id text primary key references public.select_galleries(id) on delete cascade,
  token_version integer not null,
  revision bigint not null default 1 check (revision > 0),
  selected_image_ids text[] not null default '{}',
  ratings jsonb not null default '{}'::jsonb,
  image_notes jsonb not null default '{}'::jsonb,
  customer_memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.select_gallery_drafts enable row level security;
drop policy if exists "service role select gallery drafts" on public.select_gallery_drafts;
create policy "service role select gallery drafts"
  on public.select_gallery_drafts for all to service_role
  using (true) with check (true);
grant all on table public.select_gallery_drafts to service_role;

create table if not exists public.select_public_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists select_public_rate_limits_window_idx
  on public.select_public_rate_limits (window_started_at);

alter table public.select_public_rate_limits enable row level security;
drop policy if exists "service role select public rate limits" on public.select_public_rate_limits;
create policy "service role select public rate limits"
  on public.select_public_rate_limits for all to service_role
  using (true) with check (true);
grant all on table public.select_public_rate_limits to service_role;

create or replace function public.consume_select_public_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(trim(p_key_hash), '') = '' or p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.select_public_rate_limits (
    key_hash, window_started_at, request_count, updated_at
  ) values (
    p_key_hash, now(), 1, now()
  )
  on conflict (key_hash) do update
  set window_started_at = case
        when public.select_public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then now()
        else public.select_public_rate_limits.window_started_at
      end,
      request_count = case
        when public.select_public_rate_limits.window_started_at
          <= now() - make_interval(secs => p_window_seconds)
        then 1
        else public.select_public_rate_limits.request_count + 1
      end,
      updated_at = now()
  returning request_count into v_count;

  delete from public.select_public_rate_limits
  where window_started_at < now() - interval '2 days';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_select_public_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_select_public_rate_limit(text, integer, integer)
  to service_role;

-- 공개 토큰 제출은 선택, 사진별 메모·별점, 갤러리 상태, RAW 재승인 상태를 한 트랜잭션에서 기록한다.
create or replace function public.submit_public_select_gallery(
  p_share_token text,
  p_request_key text,
  p_items jsonb,
  p_customer_memo text,
  p_submission_source text default 'public_bridge'
)
returns table(selection_id text, selected_count integer, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery public.select_galleries%rowtype;
  v_existing public.client_photo_selections%rowtype;
  v_selection_id text;
  v_selected_files text[];
  v_requested_count integer;
  v_valid_count integer;
  v_distinct_count integer;
begin
  if coalesce(trim(p_share_token), '') = '' then
    raise exception using errcode = '42501', message = 'INVALID_SHARE_TOKEN';
  end if;
  if coalesce(trim(p_request_key), '') = '' or char_length(p_request_key) > 200 then
    raise exception using errcode = '22023', message = 'REQUEST_KEY_REQUIRED';
  end if;
  if p_submission_source not in ('public_bridge', 'classic_web') then
    raise exception using errcode = '22023', message = 'INVALID_SUBMISSION_SOURCE';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'INVALID_SELECTION_ITEMS';
  end if;

  select * into v_gallery
  from public.select_galleries
  where share_token = p_share_token
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GALLERY_NOT_FOUND';
  end if;

  select * into v_existing
  from public.client_photo_selections
  where request_key = p_request_key;
  if found then
    if v_existing.gallery_id is distinct from v_gallery.id then
      raise exception using errcode = '23505', message = 'REQUEST_KEY_CONFLICT';
    end if;
    return query select v_existing.id, v_existing.selected_count, false;
    return;
  end if;

  if v_gallery.status = 'expired' or v_gallery.file_expires_at <= now() then
    raise exception using errcode = '55000', message = 'GALLERY_EXPIRED';
  end if;
  if not v_gallery.allow_web_select then
    raise exception using errcode = '42501', message = 'WEB_SELECT_DISABLED';
  end if;
  if exists (
    select 1 from public.client_photo_selections
    where gallery_id = v_gallery.id
  ) and not v_gallery.allow_resubmit then
    raise exception using errcode = '55000', message = 'RESUBMIT_DISABLED';
  end if;
  if char_length(coalesce(p_customer_memo, '')) > 5000 then
    raise exception using errcode = '22023', message = 'CUSTOMER_MEMO_TOO_LONG';
  end if;

  select count(*), count(distinct item.image_id)
    into v_requested_count, v_distinct_count
  from jsonb_to_recordset(p_items) as item(image_id text, rating integer, memo text);

  if v_requested_count = 0 then
    raise exception using errcode = '22023', message = 'SELECTION_REQUIRED';
  end if;
  if v_requested_count > 10000 or v_requested_count is distinct from v_distinct_count then
    raise exception using errcode = '22023', message = 'INVALID_SELECTION_ITEMS';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(image_id text, rating integer, memo text)
    where coalesce(trim(item.image_id), '') = ''
      or (item.rating is not null and item.rating not between 1 and 5)
      or char_length(coalesce(item.memo, '')) > 1000
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SELECTION_ITEMS';
  end if;

  select array_agg(image.original_file_name order by image.sort_order, image.id), count(*)
    into v_selected_files, v_valid_count
  from jsonb_to_recordset(p_items) as item(image_id text, rating integer, memo text)
  join public.select_gallery_images image
    on image.id = item.image_id and image.gallery_id = v_gallery.id;

  if v_valid_count is distinct from v_requested_count then
    raise exception using errcode = '22023', message = 'INVALID_IMAGE_SELECTION';
  end if;

  insert into public.client_photo_selections (
    client_id, workflow_run_id, gallery_id, method, selected_files,
    selected_count, customer_memo, submission_source, request_key, submitted_at
  ) values (
    v_gallery.client_id, v_gallery.workflow_run_id, v_gallery.id, 'web_select',
    v_selected_files, v_valid_count, coalesce(p_customer_memo, ''),
    p_submission_source, p_request_key, now()
  )
  returning id into v_selection_id;

  insert into public.client_photo_selection_items (
    selection_id, gallery_id, image_id, file_name, category,
    memo, retouch_keys, customer_rating
  )
  select
    v_selection_id,
    v_gallery.id,
    image.id,
    image.original_file_name,
    case
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(profile|프로필)' then 'profile'
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(interior|인테리어|외관|공간컷)' then 'interior'
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(skin_care|staged|consultation|treatment|연출|상담|시술|진료|수술|피부관리)' then 'staged'
      else 'unclassified'
    end,
    coalesce(item.memo, ''),
    '[]'::jsonb,
    item.rating::smallint
  from jsonb_to_recordset(p_items) as item(image_id text, rating integer, memo text)
  join public.select_gallery_images image
    on image.id = item.image_id and image.gallery_id = v_gallery.id;

  update public.select_raw_matches
  set invalidated_at = now(),
      invalidated_by_selection_id = v_selection_id
  where gallery_id = v_gallery.id
    and invalidated_at is null;

  insert into public.select_gallery_drafts (
    gallery_id, token_version, revision, selected_image_ids,
    ratings, image_notes, customer_memo, updated_at
  )
  select
    v_gallery.id,
    v_gallery.share_token_version,
    coalesce((select revision + 1 from public.select_gallery_drafts where gallery_id = v_gallery.id), 1),
    array_agg(item.image_id order by image.sort_order, image.id),
    coalesce(jsonb_object_agg(item.image_id, item.rating) filter (where item.rating is not null), '{}'::jsonb),
    coalesce(jsonb_object_agg(item.image_id, item.memo) filter (where coalesce(item.memo, '') <> ''), '{}'::jsonb),
    coalesce(p_customer_memo, ''),
    now()
  from jsonb_to_recordset(p_items) as item(image_id text, rating integer, memo text)
  join public.select_gallery_images image
    on image.id = item.image_id and image.gallery_id = v_gallery.id
  on conflict (gallery_id) do update
  set token_version = excluded.token_version,
      revision = excluded.revision,
      selected_image_ids = excluded.selected_image_ids,
      ratings = excluded.ratings,
      image_notes = excluded.image_notes,
      customer_memo = excluded.customer_memo,
      updated_at = now();

  update public.select_galleries
  set status = 'selection_submitted',
      selected_count = v_valid_count,
      submitted_at = now(),
      selection_revision = selection_revision + 1,
      updated_at = now()
  where id = v_gallery.id;

  return query select v_selection_id, v_valid_count, true;
end;
$$;

revoke all on function public.submit_public_select_gallery(text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_public_select_gallery(text, text, jsonb, text, text)
  to service_role;

create or replace function public.submit_public_select_gallery_upload(
  p_share_token text,
  p_request_key text,
  p_selected_files text[],
  p_customer_memo text
)
returns table(selection_id text, selected_count integer, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery public.select_galleries%rowtype;
  v_existing public.client_photo_selections%rowtype;
  v_selection_id text;
  v_files text[];
  v_count integer;
begin
  if coalesce(trim(p_share_token), '') = '' then
    raise exception using errcode = '42501', message = 'INVALID_SHARE_TOKEN';
  end if;
  if coalesce(trim(p_request_key), '') = '' or char_length(p_request_key) > 200 then
    raise exception using errcode = '22023', message = 'REQUEST_KEY_REQUIRED';
  end if;
  if char_length(coalesce(p_customer_memo, '')) > 5000 then
    raise exception using errcode = '22023', message = 'CUSTOMER_MEMO_TOO_LONG';
  end if;

  select * into v_gallery
  from public.select_galleries
  where share_token = p_share_token
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'GALLERY_NOT_FOUND';
  end if;

  select * into v_existing
  from public.client_photo_selections
  where request_key = p_request_key;
  if found then
    if v_existing.gallery_id is distinct from v_gallery.id then
      raise exception using errcode = '23505', message = 'REQUEST_KEY_CONFLICT';
    end if;
    return query select v_existing.id, v_existing.selected_count, false;
    return;
  end if;

  -- 다운로드한 JPG의 파일명 제출은 Storage 보관 만료 뒤에도 계속 허용한다.
  if v_gallery.status = 'expired' then
    raise exception using errcode = '55000', message = 'GALLERY_EXPIRED';
  end if;
  if not v_gallery.allow_download_upload then
    raise exception using errcode = '42501', message = 'UPLOAD_SELECT_DISABLED';
  end if;
  if exists (
    select 1 from public.client_photo_selections where gallery_id = v_gallery.id
  ) and not v_gallery.allow_resubmit then
    raise exception using errcode = '55000', message = 'RESUBMIT_DISABLED';
  end if;

  select array_agg(file_name order by file_name), count(*)
    into v_files, v_count
  from (
    select distinct trim(file_name) as file_name
    from unnest(coalesce(p_selected_files, '{}'::text[])) as file_name
    where trim(file_name) <> ''
  ) selected;

  if coalesce(v_count, 0) = 0 or v_count > 10000 then
    raise exception using errcode = '22023', message = 'SELECTION_REQUIRED';
  end if;
  if exists (
    select 1
    from unnest(v_files) selected(file_name)
    left join lateral (
      select count(*) as matches
      from public.select_gallery_images image
      where image.gallery_id = v_gallery.id
        and image.original_file_name = selected.file_name
    ) candidate on true
    where candidate.matches <> 1
  ) then
    raise exception using errcode = '22023', message = 'INVALID_OR_AMBIGUOUS_FILE_SELECTION';
  end if;

  insert into public.client_photo_selections (
    client_id, workflow_run_id, gallery_id, method, selected_files,
    selected_count, customer_memo, submission_source, request_key, submitted_at
  ) values (
    v_gallery.client_id, v_gallery.workflow_run_id, v_gallery.id, 'download_upload',
    v_files, v_count, coalesce(p_customer_memo, ''),
    'classic_upload', p_request_key, now()
  ) returning id into v_selection_id;

  insert into public.client_photo_selection_items (
    selection_id, gallery_id, image_id, file_name, category,
    memo, retouch_keys, customer_rating
  )
  select
    v_selection_id,
    v_gallery.id,
    image.id,
    image.original_file_name,
    case
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(profile|프로필)' then 'profile'
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(interior|인테리어|외관|공간컷)' then 'interior'
      when lower(coalesce(image.scene_name, '') || ' ' || coalesce(image.folder_name, ''))
        ~ '(skin_care|staged|consultation|treatment|연출|상담|시술|진료|수술|피부관리)' then 'staged'
      else 'unclassified'
    end,
    '',
    '[]'::jsonb,
    null
  from unnest(v_files) selected(file_name)
  join public.select_gallery_images image
    on image.gallery_id = v_gallery.id
   and image.original_file_name = selected.file_name;

  update public.select_raw_matches
  set invalidated_at = now(), invalidated_by_selection_id = v_selection_id
  where gallery_id = v_gallery.id and invalidated_at is null;

  update public.select_galleries
  set status = 'selection_submitted',
      selected_count = v_count,
      submitted_at = now(),
      selection_revision = selection_revision + 1,
      updated_at = now()
  where id = v_gallery.id;

  return query select v_selection_id, v_count, true;
end;
$$;

revoke all on function public.submit_public_select_gallery_upload(text, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.submit_public_select_gallery_upload(text, text, text[], text)
  to service_role;

notify pgrst, 'reload schema';
