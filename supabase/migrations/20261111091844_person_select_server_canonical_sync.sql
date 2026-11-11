-- 공동·개인별 사진선택을 사진 단위 diff로 저장한다.
-- 공개 브라우저는 이 테이블을 직접 읽거나 쓰지 않으며, 토큰/PIN을 검증한
-- 서버 API만 service_role RPC를 호출한다. 기존 draft/choices는 호환용으로
-- 같은 트랜잭션에서 계속 materialize한다.

create extension if not exists pgcrypto;

create table if not exists public.person_select_selection_item_states (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  actor_type text not null check (actor_type in ('reviewer', 'person')),
  actor_id uuid not null,
  image_id uuid not null references public.person_select_images(id) on delete cascade,
  category_key text not null default '',
  selected boolean not null default false,
  rating smallint,
  color_label smallint,
  memo text not null default '',
  retouch_keys jsonb not null default '[]'::jsonb,
  selected_changed_at timestamptz not null default to_timestamp(0),
  selected_client_id text not null default '',
  selected_client_seq bigint not null default 0,
  rating_changed_at timestamptz not null default to_timestamp(0),
  rating_client_id text not null default '',
  rating_client_seq bigint not null default 0,
  color_changed_at timestamptz not null default to_timestamp(0),
  color_client_id text not null default '',
  color_client_seq bigint not null default 0,
  memo_changed_at timestamptz not null default to_timestamp(0),
  memo_client_id text not null default '',
  memo_client_seq bigint not null default 0,
  retouch_changed_at timestamptz not null default to_timestamp(0),
  retouch_client_id text not null default '',
  retouch_client_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, actor_type, actor_id, image_id),
  check (rating is null or rating between 1 and 5),
  check (color_label is null or color_label between 6 and 9),
  check (jsonb_typeof(retouch_keys) = 'array'),
  check (char_length(memo) <= 1000)
);

create index if not exists person_select_selection_states_actor_updated_idx
  on public.person_select_selection_item_states(event_id, actor_type, actor_id, updated_at desc);
create index if not exists person_select_selection_states_event_selected_idx
  on public.person_select_selection_item_states(event_id, actor_type, selected, image_id);

create table if not exists public.person_select_selection_diff_receipts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  actor_type text not null check (actor_type in ('reviewer', 'person')),
  actor_id uuid not null,
  client_id text not null,
  client_seq bigint not null check (client_seq > 0),
  created_at timestamptz not null default now(),
  unique(event_id, actor_type, actor_id, client_id, client_seq),
  check (char_length(client_id) between 8 and 120)
);

create index if not exists person_select_selection_diff_receipts_created_idx
  on public.person_select_selection_diff_receipts(created_at);

create table if not exists public.person_select_selection_save_failures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.person_select_events(id) on delete cascade,
  actor_type text not null check (actor_type in ('reviewer', 'person')),
  actor_id uuid not null,
  error_code text not null default '',
  error_stage text not null default 'save',
  error_message text not null default '',
  occurred_at timestamptz not null default now(),
  recovered_at timestamptz,
  check (char_length(error_code) <= 80),
  check (char_length(error_stage) <= 80),
  check (char_length(error_message) <= 500)
);

create index if not exists person_select_selection_save_failures_open_idx
  on public.person_select_selection_save_failures(event_id, actor_type, actor_id, occurred_at desc)
  where recovered_at is null;

alter table public.person_select_selection_item_states enable row level security;
alter table public.person_select_selection_diff_receipts enable row level security;
alter table public.person_select_selection_save_failures enable row level security;

drop policy if exists "service role person select selection item states" on public.person_select_selection_item_states;
create policy "service role person select selection item states"
  on public.person_select_selection_item_states for all to service_role using (true) with check (true);
drop policy if exists "service role person select selection diff receipts" on public.person_select_selection_diff_receipts;
create policy "service role person select selection diff receipts"
  on public.person_select_selection_diff_receipts for all to service_role using (true) with check (true);
drop policy if exists "service role person select selection save failures" on public.person_select_selection_save_failures;
create policy "service role person select selection save failures"
  on public.person_select_selection_save_failures for all to service_role using (true) with check (true);

revoke all on table public.person_select_selection_item_states from public, anon, authenticated;
revoke all on table public.person_select_selection_diff_receipts from public, anon, authenticated;
revoke all on table public.person_select_selection_save_failures from public, anon, authenticated;
grant all on table public.person_select_selection_item_states to service_role;
grant all on table public.person_select_selection_diff_receipts to service_role;
grant all on table public.person_select_selection_save_failures to service_role;

-- 기존 개인별 선택을 사진 상태표에 보존한다.
insert into public.person_select_selection_item_states (
  event_id, actor_type, actor_id, image_id, category_key, selected,
  memo, retouch_keys, selected_changed_at, memo_changed_at, retouch_changed_at,
  selected_client_id, memo_client_id, retouch_client_id,
  selected_client_seq, memo_client_seq, retouch_client_seq, updated_at
)
select choice.event_id, 'person', choice.person_id, choice.image_id, choice.category_key, true,
  coalesce(choice.memo, ''), coalesce(choice.retouch_keys, '[]'::jsonb),
  coalesce(choice.updated_at, choice.created_at, now()),
  coalesce(choice.updated_at, choice.created_at, now()),
  coalesce(choice.updated_at, choice.created_at, now()),
  'legacy', 'legacy', 'legacy', 1, 1, 1,
  coalesce(choice.updated_at, choice.created_at, now())
from public.person_select_choices choice
on conflict (event_id, actor_type, actor_id, image_id) do nothing;

-- 기존 검토자별 공동 초안도 같은 서버 기준 상태로 이관한다.
insert into public.person_select_selection_item_states (
  event_id, actor_type, actor_id, image_id, category_key, selected,
  rating, color_label, memo,
  selected_changed_at, rating_changed_at, color_changed_at, memo_changed_at,
  selected_client_id, rating_client_id, color_client_id, memo_client_id,
  selected_client_seq, rating_client_seq, color_client_seq, memo_client_seq, updated_at
)
select draft.event_id, 'reviewer', draft.reviewer_id, (item->>'image_id')::uuid,
  coalesce(image.category_key, ''), true,
  nullif(item->>'customer_rating', '')::smallint,
  nullif(item->>'customer_color_label', '')::smallint,
  coalesce(item->>'memo', ''),
  draft.updated_at, draft.updated_at, draft.updated_at, draft.updated_at,
  'legacy', 'legacy', 'legacy', 'legacy', 1, 1, 1, 1, draft.updated_at
from public.person_select_shared_drafts draft
cross join lateral jsonb_array_elements(coalesce(draft.items, '[]'::jsonb)) item
join public.person_select_images image
  on image.id = (item->>'image_id')::uuid and image.event_id = draft.event_id
where coalesce(item->>'image_id', '') <> ''
on conflict (event_id, actor_type, actor_id, image_id) do nothing;

create or replace function public.person_select_diff_is_newer(
  p_changed_at timestamptz,
  p_client_seq bigint,
  p_client_id text,
  p_current_changed_at timestamptz,
  p_current_client_seq bigint,
  p_current_client_id text
) returns boolean
language sql immutable parallel safe as $$
  select (p_changed_at, p_client_seq, p_client_id)
       > (p_current_changed_at, p_current_client_seq, p_current_client_id)
$$;

revoke all on function public.person_select_diff_is_newer(timestamptz,bigint,text,timestamptz,bigint,text)
  from public, anon, authenticated;
grant execute on function public.person_select_diff_is_newer(timestamptz,bigint,text,timestamptz,bigint,text)
  to service_role;

create or replace function public.save_person_select_shared_item_diffs(
  p_event_id uuid,
  p_reviewer_id uuid,
  p_client_id text,
  p_diffs jsonb
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb;
  image_row public.person_select_images%rowtype;
  receipt_id uuid;
  changed_at timestamptz;
  client_seq bigint;
  next_items jsonb;
  existing_memo text;
begin
  if char_length(coalesce(p_client_id, '')) not between 8 and 120 then
    raise exception 'invalid_client_id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_diffs) is distinct from 'array' or jsonb_array_length(p_diffs) > 200 then
    raise exception 'invalid_selection_diffs' using errcode = '22023';
  end if;
  -- 검토자 한 명의 동시 저장을 직렬화한다. 서로 다른 사진을 동시에 바꿔도
  -- 아래 호환 draft materialize 단계가 이전 요청의 사진을 덮어쓰지 않는다.
  perform 1 from public.person_select_shared_reviewers
  where id = p_reviewer_id and event_id = p_event_id and active
  for update;
  if not found then
    raise exception 'shared_reviewer_not_available' using errcode = '42501';
  end if;

  for diff in select value from jsonb_array_elements(p_diffs) loop
    client_seq := coalesce((diff->>'clientSeq')::bigint, 0);
    if client_seq <= 0 then raise exception 'invalid_client_seq' using errcode = '22023'; end if;
    changed_at := least(coalesce((diff->>'changedAt')::timestamptz, now()), now() + interval '5 minutes');

    select * into image_row from public.person_select_images
      where id = (diff->>'imageId')::uuid and event_id = p_event_id;
    if not found then raise exception 'shared_image_not_owned' using errcode = '22023'; end if;

    receipt_id := null;
    insert into public.person_select_selection_diff_receipts(
      event_id, actor_type, actor_id, client_id, client_seq
    ) values (p_event_id, 'reviewer', p_reviewer_id, p_client_id, client_seq)
    on conflict do nothing returning id into receipt_id;
    if receipt_id is null then continue; end if;

    insert into public.person_select_selection_item_states as state (
      event_id, actor_type, actor_id, image_id, category_key,
      rating, color_label, memo,
      rating_changed_at, rating_client_id, rating_client_seq,
      color_changed_at, color_client_id, color_client_seq,
      memo_changed_at, memo_client_id, memo_client_seq,
      updated_at
    ) values (
      p_event_id, 'reviewer', p_reviewer_id, image_row.id, image_row.category_key,
      case when diff ? 'rating' then nullif(diff->>'rating', '')::smallint else null end,
      case when diff ? 'colorLabel' then nullif(diff->>'colorLabel', '')::smallint else null end,
      case when diff ? 'memo' then coalesce(diff->>'memo', '') else '' end,
      case when diff ? 'rating' then changed_at else to_timestamp(0) end,
      case when diff ? 'rating' then p_client_id else '' end,
      case when diff ? 'rating' then client_seq else 0 end,
      case when diff ? 'colorLabel' then changed_at else to_timestamp(0) end,
      case when diff ? 'colorLabel' then p_client_id else '' end,
      case when diff ? 'colorLabel' then client_seq else 0 end,
      case when diff ? 'memo' then changed_at else to_timestamp(0) end,
      case when diff ? 'memo' then p_client_id else '' end,
      case when diff ? 'memo' then client_seq else 0 end,
      now()
    )
    on conflict (event_id, actor_type, actor_id, image_id) do update set
      category_key = excluded.category_key,
      rating = case when public.person_select_diff_is_newer(
        excluded.rating_changed_at, excluded.rating_client_seq, excluded.rating_client_id,
        state.rating_changed_at, state.rating_client_seq, state.rating_client_id
      ) then excluded.rating else state.rating end,
      rating_changed_at = greatest(state.rating_changed_at, excluded.rating_changed_at),
      rating_client_id = case when public.person_select_diff_is_newer(
        excluded.rating_changed_at, excluded.rating_client_seq, excluded.rating_client_id,
        state.rating_changed_at, state.rating_client_seq, state.rating_client_id
      ) then excluded.rating_client_id else state.rating_client_id end,
      rating_client_seq = case when public.person_select_diff_is_newer(
        excluded.rating_changed_at, excluded.rating_client_seq, excluded.rating_client_id,
        state.rating_changed_at, state.rating_client_seq, state.rating_client_id
      ) then excluded.rating_client_seq else state.rating_client_seq end,
      color_label = case when public.person_select_diff_is_newer(
        excluded.color_changed_at, excluded.color_client_seq, excluded.color_client_id,
        state.color_changed_at, state.color_client_seq, state.color_client_id
      ) then excluded.color_label else state.color_label end,
      color_changed_at = greatest(state.color_changed_at, excluded.color_changed_at),
      color_client_id = case when public.person_select_diff_is_newer(
        excluded.color_changed_at, excluded.color_client_seq, excluded.color_client_id,
        state.color_changed_at, state.color_client_seq, state.color_client_id
      ) then excluded.color_client_id else state.color_client_id end,
      color_client_seq = case when public.person_select_diff_is_newer(
        excluded.color_changed_at, excluded.color_client_seq, excluded.color_client_id,
        state.color_changed_at, state.color_client_seq, state.color_client_id
      ) then excluded.color_client_seq else state.color_client_seq end,
      memo = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo else state.memo end,
      memo_changed_at = greatest(state.memo_changed_at, excluded.memo_changed_at),
      memo_client_id = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo_client_id else state.memo_client_id end,
      memo_client_seq = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo_client_seq else state.memo_client_seq end,
      updated_at = now();
  end loop;

  -- 별점/컬러가 실제로 바뀐 사진만 선택 여부를 다시 계산한다.
  -- 기존 classic 초안은 항목 존재 자체가 선택이므로, 손대지 않은 null 별점 행을 유지한다.
  update public.person_select_selection_item_states state
  set selected = (rating is not null or color_label is not null), updated_at = now()
  where event_id = p_event_id and actor_type = 'reviewer' and actor_id = p_reviewer_id
    and state.image_id in (
      select (value->>'imageId')::uuid
      from jsonb_array_elements(p_diffs)
      where value ? 'rating' or value ? 'colorLabel'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'image_id', state.image_id,
    'customer_rating', state.rating,
    'customer_color_label', state.color_label,
    'memo', state.memo
  ) order by image.sort_order, image.id) filter (where state.selected), '[]'::jsonb)
  into next_items
  from public.person_select_selection_item_states state
  join public.person_select_images image on image.id = state.image_id
  where state.event_id = p_event_id and state.actor_type = 'reviewer' and state.actor_id = p_reviewer_id;

  select coalesce(draft.customer_memo, '') into existing_memo
  from public.person_select_shared_drafts draft
  where draft.event_id = p_event_id and draft.reviewer_id = p_reviewer_id;

  insert into public.person_select_shared_drafts(event_id, reviewer_id, revision, items, customer_memo, updated_at)
  values (p_event_id, p_reviewer_id, 1, next_items, coalesce(existing_memo, ''), now())
  on conflict (event_id, reviewer_id) do update
  set revision = public.person_select_shared_drafts.revision + 1,
      items = excluded.items,
      updated_at = now();

  update public.person_select_selection_save_failures
  set recovered_at = now()
  where event_id = p_event_id and actor_type = 'reviewer' and actor_id = p_reviewer_id and recovered_at is null;

  return query
  select draft.revision, draft.items, draft.customer_memo, draft.updated_at
  from public.person_select_shared_drafts draft
  where draft.event_id = p_event_id and draft.reviewer_id = p_reviewer_id;
end $$;

revoke all on function public.save_person_select_shared_item_diffs(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_person_select_shared_item_diffs(uuid,uuid,text,jsonb)
  to service_role;

create or replace function public.save_person_select_shared_customer_memo(
  p_event_id uuid,
  p_reviewer_id uuid,
  p_customer_memo text
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  next_items jsonb;
begin
  if char_length(coalesce(p_customer_memo, '')) > 5000 then
    raise exception 'customer_memo_too_long' using errcode = '22023';
  end if;
  perform 1 from public.person_select_shared_reviewers
  where id = p_reviewer_id and event_id = p_event_id and active
  for update;
  if not found then
    raise exception 'shared_reviewer_not_available' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'image_id', state.image_id,
    'customer_rating', state.rating,
    'customer_color_label', state.color_label,
    'memo', state.memo
  ) order by image.sort_order, image.id) filter (where state.selected), '[]'::jsonb)
  into next_items
  from public.person_select_selection_item_states state
  join public.person_select_images image on image.id = state.image_id
  where state.event_id = p_event_id and state.actor_type = 'reviewer' and state.actor_id = p_reviewer_id;

  insert into public.person_select_shared_drafts(event_id, reviewer_id, revision, items, customer_memo, updated_at)
  values (p_event_id, p_reviewer_id, 1, next_items, coalesce(p_customer_memo, ''), now())
  on conflict (event_id, reviewer_id) do update
  set revision = public.person_select_shared_drafts.revision + 1,
      items = excluded.items,
      customer_memo = excluded.customer_memo,
      updated_at = now();

  update public.person_select_selection_save_failures
  set recovered_at = now()
  where event_id = p_event_id and actor_type = 'reviewer' and actor_id = p_reviewer_id and recovered_at is null;

  return query
  select draft.revision, draft.items, draft.customer_memo, draft.updated_at
  from public.person_select_shared_drafts draft
  where draft.event_id = p_event_id and draft.reviewer_id = p_reviewer_id;
end $$;

revoke all on function public.save_person_select_shared_customer_memo(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.save_person_select_shared_customer_memo(uuid,uuid,text)
  to service_role;

create or replace function public.save_person_select_person_item_diffs(
  p_event_id uuid,
  p_person_id uuid,
  p_client_id text,
  p_diffs jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb;
  image_row public.person_select_images%rowtype;
  person_row public.person_select_people%rowtype;
  event_row public.person_select_events%rowtype;
  receipt_id uuid;
  changed_at timestamptz;
  client_seq bigint;
  invalid_category text;
  next_items jsonb;
begin
  if char_length(coalesce(p_client_id, '')) not between 8 and 120 then
    raise exception 'invalid_client_id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_diffs) is distinct from 'array' or jsonb_array_length(p_diffs) > 200 then
    raise exception 'invalid_selection_diffs' using errcode = '22023';
  end if;
  select * into person_row from public.person_select_people where id = p_person_id and event_id = p_event_id for update;
  if not found then raise exception 'person_not_available' using errcode = '42501'; end if;
  select * into event_row from public.person_select_events where id = p_event_id;

  for diff in select value from jsonb_array_elements(p_diffs) loop
    client_seq := coalesce((diff->>'clientSeq')::bigint, 0);
    if client_seq <= 0 then raise exception 'invalid_client_seq' using errcode = '22023'; end if;
    changed_at := least(coalesce((diff->>'changedAt')::timestamptz, now()), now() + interval '5 minutes');
    select * into image_row from public.person_select_images
      where id = (diff->>'imageId')::uuid and event_id = p_event_id;
    if not found or not (
      (image_row.category_key = 'homeroom' and person_row.group_label is not null and image_row.owner_group = person_row.group_label)
      or (image_row.category_key <> 'homeroom' and image_row.owner_person_id = p_person_id)
    ) then
      raise exception 'person_image_not_owned' using errcode = '42501';
    end if;

    receipt_id := null;
    insert into public.person_select_selection_diff_receipts(
      event_id, actor_type, actor_id, client_id, client_seq
    ) values (p_event_id, 'person', p_person_id, p_client_id, client_seq)
    on conflict do nothing returning id into receipt_id;
    if receipt_id is null then continue; end if;

    insert into public.person_select_selection_item_states as state (
      event_id, actor_type, actor_id, image_id, category_key,
      selected, memo, retouch_keys,
      selected_changed_at, selected_client_id, selected_client_seq,
      memo_changed_at, memo_client_id, memo_client_seq,
      retouch_changed_at, retouch_client_id, retouch_client_seq,
      updated_at
    ) values (
      p_event_id, 'person', p_person_id, image_row.id, image_row.category_key,
      case when diff ? 'selected' then coalesce((diff->>'selected')::boolean, false) else false end,
      case when diff ? 'memo' then coalesce(diff->>'memo', '') else '' end,
      case when diff ? 'retouchKeys' then coalesce(diff->'retouchKeys', '[]'::jsonb) else '[]'::jsonb end,
      case when diff ? 'selected' then changed_at else to_timestamp(0) end,
      case when diff ? 'selected' then p_client_id else '' end,
      case when diff ? 'selected' then client_seq else 0 end,
      case when diff ? 'memo' then changed_at else to_timestamp(0) end,
      case when diff ? 'memo' then p_client_id else '' end,
      case when diff ? 'memo' then client_seq else 0 end,
      case when diff ? 'retouchKeys' then changed_at else to_timestamp(0) end,
      case when diff ? 'retouchKeys' then p_client_id else '' end,
      case when diff ? 'retouchKeys' then client_seq else 0 end,
      now()
    )
    on conflict (event_id, actor_type, actor_id, image_id) do update set
      category_key = excluded.category_key,
      selected = case when public.person_select_diff_is_newer(
        excluded.selected_changed_at, excluded.selected_client_seq, excluded.selected_client_id,
        state.selected_changed_at, state.selected_client_seq, state.selected_client_id
      ) then excluded.selected else state.selected end,
      selected_changed_at = greatest(state.selected_changed_at, excluded.selected_changed_at),
      selected_client_id = case when public.person_select_diff_is_newer(
        excluded.selected_changed_at, excluded.selected_client_seq, excluded.selected_client_id,
        state.selected_changed_at, state.selected_client_seq, state.selected_client_id
      ) then excluded.selected_client_id else state.selected_client_id end,
      selected_client_seq = case when public.person_select_diff_is_newer(
        excluded.selected_changed_at, excluded.selected_client_seq, excluded.selected_client_id,
        state.selected_changed_at, state.selected_client_seq, state.selected_client_id
      ) then excluded.selected_client_seq else state.selected_client_seq end,
      memo = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo else state.memo end,
      memo_changed_at = greatest(state.memo_changed_at, excluded.memo_changed_at),
      memo_client_id = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo_client_id else state.memo_client_id end,
      memo_client_seq = case when public.person_select_diff_is_newer(
        excluded.memo_changed_at, excluded.memo_client_seq, excluded.memo_client_id,
        state.memo_changed_at, state.memo_client_seq, state.memo_client_id
      ) then excluded.memo_client_seq else state.memo_client_seq end,
      retouch_keys = case when public.person_select_diff_is_newer(
        excluded.retouch_changed_at, excluded.retouch_client_seq, excluded.retouch_client_id,
        state.retouch_changed_at, state.retouch_client_seq, state.retouch_client_id
      ) then excluded.retouch_keys else state.retouch_keys end,
      retouch_changed_at = greatest(state.retouch_changed_at, excluded.retouch_changed_at),
      retouch_client_id = case when public.person_select_diff_is_newer(
        excluded.retouch_changed_at, excluded.retouch_client_seq, excluded.retouch_client_id,
        state.retouch_changed_at, state.retouch_client_seq, state.retouch_client_id
      ) then excluded.retouch_client_id else state.retouch_client_id end,
      retouch_client_seq = case when public.person_select_diff_is_newer(
        excluded.retouch_changed_at, excluded.retouch_client_seq, excluded.retouch_client_id,
        state.retouch_changed_at, state.retouch_client_seq, state.retouch_client_id
      ) then excluded.retouch_client_seq else state.retouch_client_seq end,
      updated_at = now();
  end loop;

  select category_key into invalid_category
  from public.person_select_selection_item_states state
  where state.event_id = p_event_id and state.actor_type = 'person' and state.actor_id = p_person_id and state.selected
  group by category_key
  having count(*) > coalesce((
    select greatest(1, (category->>'pick')::integer)
      + case when coalesce(event_row.extra_price, 0) > 0 then greatest(0, coalesce(event_row.extra_max, 0)) else 0 end
    from jsonb_array_elements(coalesce(event_row.categories, '[]'::jsonb)) category
    where category->>'key' = state.category_key
  ), 1)
  limit 1;
  if invalid_category is not null then
    raise exception 'selection_limit_exceeded:%', invalid_category using errcode = 'PT409';
  end if;

  insert into public.person_select_choice_history(choice_id, person_id, category_key, image_id, retouch_keys, memo, action)
  select choice.id, choice.person_id, choice.category_key, choice.image_id, choice.retouch_keys, choice.memo, 'save'
  from public.person_select_choices choice
  where choice.event_id = p_event_id and choice.person_id = p_person_id
    and choice.image_id in (select (value->>'imageId')::uuid from jsonb_array_elements(p_diffs));

  delete from public.person_select_choices choice
  where choice.event_id = p_event_id and choice.person_id = p_person_id
    and not exists (
      select 1 from public.person_select_selection_item_states state
      where state.event_id = p_event_id and state.actor_type = 'person' and state.actor_id = p_person_id
        and state.image_id = choice.image_id and state.selected
    );

  insert into public.person_select_choices(event_id, person_id, category_key, image_id, retouch_keys, memo, updated_at)
  select state.event_id, p_person_id, state.category_key, state.image_id, state.retouch_keys, state.memo, state.updated_at
  from public.person_select_selection_item_states state
  where state.event_id = p_event_id and state.actor_type = 'person' and state.actor_id = p_person_id and state.selected
  on conflict (person_id, image_id) do update
  set category_key = excluded.category_key,
      retouch_keys = excluded.retouch_keys,
      memo = excluded.memo,
      updated_at = excluded.updated_at;

  update public.person_select_people
  set last_seen_at = now(), updated_at = now()
  where id = p_person_id;
  update public.person_select_selection_save_failures
  set recovered_at = now()
  where event_id = p_event_id and actor_type = 'person' and actor_id = p_person_id and recovered_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'imageId', state.image_id,
    'categoryKey', state.category_key,
    'selected', state.selected,
    'memo', state.memo,
    'retouchKeys', state.retouch_keys,
    'updatedAt', state.updated_at
  ) order by image.sort_order, image.id), '[]'::jsonb)
  into next_items
  from public.person_select_selection_item_states state
  join public.person_select_images image on image.id = state.image_id
  where state.event_id = p_event_id and state.actor_type = 'person' and state.actor_id = p_person_id;

  return jsonb_build_object('items', next_items, 'updatedAt', now());
end $$;

revoke all on function public.save_person_select_person_item_diffs(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_person_select_person_item_diffs(uuid,uuid,text,jsonb)
  to service_role;

-- receipt는 재시도 멱등성에만 필요하다. 운영 보관 정책으로 오래된 행을 정리할 수 있다.
comment on table public.person_select_selection_diff_receipts is
  'Idempotency receipts for person-select per-image diff writes. Safe to prune after the client retry window.';

notify pgrst, 'reload schema';
