-- PCRM 3차: 고객 사진 셀렉, 사진별 수정 지시, 최종 납품 승인
-- 기존 select_galleries / photo_galleries 흐름을 유지하는 additive migration.

alter table public.client_photo_selections
  add column if not exists submission_source text not null default 'legacy',
  add column if not exists request_key text;

create unique index if not exists idx_client_photo_selections_request_key
  on public.client_photo_selections(request_key)
  where request_key is not null;

create table if not exists public.pcrm_selection_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  gallery_id text not null references public.select_galleries(id) on delete cascade,
  selected_image_ids text[] not null default '{}',
  favorite_image_ids text[] not null default '{}',
  image_notes jsonb not null default '{}'::jsonb,
  customer_memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, gallery_id)
);

create table if not exists public.pcrm_photo_annotations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  gallery_id uuid not null references public.photo_galleries(id) on delete cascade,
  image_id uuid not null references public.photo_gallery_items(id) on delete cascade,
  revision_request_id uuid references public.client_revision_requests(id) on delete set null,
  marker_number integer not null check (marker_number > 0),
  x_ratio numeric(7,6) not null check (x_ratio between 0 and 1),
  y_ratio numeric(7,6) not null check (y_ratio between 0 and 1),
  content text not null check (char_length(content) between 1 and 2000),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_progress', 'resolved')),
  admin_reply text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, image_id, marker_number)
);

create table if not exists public.pcrm_delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  publication_id uuid not null references public.pcrm_publications(id) on delete cascade,
  gallery_id uuid not null references public.photo_galleries(id) on delete cascade,
  first_viewed_at timestamptz,
  last_downloaded_at timestamptz,
  download_count integer not null default 0 check (download_count >= 0),
  approved_at timestamptz,
  approved_by text not null default '',
  approval_statement text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_run_id, publication_id)
);

create index if not exists idx_pcrm_selection_drafts_project
  on public.pcrm_selection_drafts(workflow_run_id, updated_at desc);
create index if not exists idx_pcrm_photo_annotations_project
  on public.pcrm_photo_annotations(workflow_run_id, gallery_id, status, updated_at desc);
create index if not exists idx_pcrm_photo_annotations_revision
  on public.pcrm_photo_annotations(revision_request_id)
  where revision_request_id is not null;
create index if not exists idx_pcrm_delivery_confirmations_project
  on public.pcrm_delivery_confirmations(workflow_run_id, updated_at desc);

drop trigger if exists pcrm_selection_drafts_updated_at on public.pcrm_selection_drafts;
create trigger pcrm_selection_drafts_updated_at
  before update on public.pcrm_selection_drafts
  for each row execute procedure public.set_updated_at();

drop trigger if exists pcrm_photo_annotations_updated_at on public.pcrm_photo_annotations;
create trigger pcrm_photo_annotations_updated_at
  before update on public.pcrm_photo_annotations
  for each row execute procedure public.set_updated_at();

drop trigger if exists pcrm_delivery_confirmations_updated_at on public.pcrm_delivery_confirmations;
create trigger pcrm_delivery_confirmations_updated_at
  before update on public.pcrm_delivery_confirmations
  for each row execute procedure public.set_updated_at();

alter table public.pcrm_selection_drafts enable row level security;
alter table public.pcrm_photo_annotations enable row level security;
alter table public.pcrm_delivery_confirmations enable row level security;

drop policy if exists "service role pcrm selection drafts" on public.pcrm_selection_drafts;
create policy "service role pcrm selection drafts" on public.pcrm_selection_drafts
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm photo annotations" on public.pcrm_photo_annotations;
create policy "service role pcrm photo annotations" on public.pcrm_photo_annotations
  for all to service_role using (true) with check (true);
drop policy if exists "service role pcrm delivery confirmations" on public.pcrm_delivery_confirmations;
create policy "service role pcrm delivery confirmations" on public.pcrm_delivery_confirmations
  for all to service_role using (true) with check (true);

grant all on table public.pcrm_selection_drafts to service_role;
grant all on table public.pcrm_photo_annotations to service_role;
grant all on table public.pcrm_delivery_confirmations to service_role;

alter table public.pcrm_attachments
  drop constraint if exists pcrm_attachments_entity_type_check;
alter table public.pcrm_attachments
  add constraint pcrm_attachments_entity_type_check
  check (entity_type in (
    'preparation', 'conti_feedback', 'inquiry_message',
    'photo_annotation', 'photo_revision'
  ));

-- PCRM 셀렉 제출은 최신 초안, 선택 이력, RAW 매칭 무효화를 한 트랜잭션에서 처리한다.
create or replace function public.submit_pcrm_photo_selection(
  p_client_id uuid,
  p_workflow_run_id uuid,
  p_gallery_id text,
  p_selected_image_ids text[],
  p_customer_memo text,
  p_request_key text
)
returns table(selection_id text, selected_count integer, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery public.select_galleries%rowtype;
  v_selected_ids text[];
  v_selected_files text[];
  v_selection_id text;
  v_count integer;
begin
  if coalesce(trim(p_request_key), '') = '' then
    raise exception using errcode = '22023', message = 'REQUEST_KEY_REQUIRED';
  end if;

  select id into v_selection_id
  from public.client_photo_selections
  where request_key = p_request_key;
  if v_selection_id is not null then
    select cps.selected_count into v_count
    from public.client_photo_selections cps where cps.id = v_selection_id;
    return query select v_selection_id, coalesce(v_count, 0), false;
    return;
  end if;

  select * into v_gallery
  from public.select_galleries
  where id = p_gallery_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'GALLERY_NOT_FOUND';
  end if;
  if v_gallery.client_id is distinct from p_client_id::text
     or v_gallery.workflow_run_id is distinct from p_workflow_run_id::text then
    raise exception using errcode = '42501', message = 'GALLERY_OWNERSHIP_MISMATCH';
  end if;
  if v_gallery.file_expires_at <= now() then
    raise exception using errcode = '55000', message = 'GALLERY_EXPIRED';
  end if;

  select coalesce(array_agg(id order by id), '{}'::text[])
    into v_selected_ids
  from (
    select distinct unnest(coalesce(p_selected_image_ids, '{}'::text[])) as id
  ) ids
  where id <> '';

  v_count := coalesce(cardinality(v_selected_ids), 0);
  if v_count = 0 then
    raise exception using errcode = '22023', message = 'SELECTION_REQUIRED';
  end if;

  select array_agg(original_file_name order by sort_order, id), count(*)
    into v_selected_files, v_count
  from public.select_gallery_images
  where gallery_id = p_gallery_id and id = any(v_selected_ids);

  if v_count is distinct from cardinality(v_selected_ids) then
    raise exception using errcode = '22023', message = 'INVALID_IMAGE_SELECTION';
  end if;

  insert into public.client_photo_selections (
    client_id, workflow_run_id, gallery_id, method, selected_files,
    selected_count, customer_memo, submission_source, request_key
  ) values (
    p_client_id::text, p_workflow_run_id::text, p_gallery_id, 'web_select',
    v_selected_files, v_count, coalesce(p_customer_memo, ''), 'pcrm', p_request_key
  )
  returning id into v_selection_id;

  insert into public.pcrm_selection_drafts (
    client_id, workflow_run_id, gallery_id, selected_image_ids, customer_memo
  ) values (
    p_client_id, p_workflow_run_id, p_gallery_id, v_selected_ids, coalesce(p_customer_memo, '')
  )
  on conflict (workflow_run_id, gallery_id) do update
  set selected_image_ids = excluded.selected_image_ids,
      customer_memo = excluded.customer_memo,
      updated_at = now();

  delete from public.select_raw_matches where gallery_id = p_gallery_id;

  update public.select_galleries
  set status = 'selection_submitted',
      selected_count = v_count,
      submitted_at = now(),
      updated_at = now()
  where id = p_gallery_id;

  update public.workflow_runs
  set current_step_key = 'client_selection',
      updated_at = now()
  where id = p_workflow_run_id
    and current_step_key in ('backup_sorting', 'client_selection');

  return query select v_selection_id, v_count, true;
end;
$$;

revoke all on function public.submit_pcrm_photo_selection(uuid, uuid, text, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.submit_pcrm_photo_selection(uuid, uuid, text, text[], text, text)
  to service_role;

notify pgrst, 'reload schema';
