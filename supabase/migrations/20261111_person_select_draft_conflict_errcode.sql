-- 40001은 PostgREST가 무한 재시도함. revision 불일치는 재시도해도 성공 못 하므로 PT409(HTTP 409)로 반환.

create or replace function public.save_person_select_shared_draft_v2(
  p_event_id uuid,
  p_reviewer_id uuid,
  p_expected_revision bigint,
  p_items jsonb,
  p_customer_memo text
) returns table(revision bigint, items jsonb, customer_memo text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare current_row public.person_select_shared_drafts%rowtype;
begin
  if not exists (
    select 1 from public.person_select_shared_reviewers
    where id = p_reviewer_id and event_id = p_event_id and active
  ) then
    raise exception 'shared_reviewer_not_available' using errcode = '42501';
  end if;

  select * into current_row from public.person_select_shared_drafts
  where event_id = p_event_id and reviewer_id = p_reviewer_id for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception 'draft_revision_conflict' using errcode = 'PT409';
    end if;
    insert into public.person_select_shared_drafts(event_id, reviewer_id, revision, items, customer_memo)
    values (p_event_id, p_reviewer_id, 1, p_items, p_customer_memo)
    returning person_select_shared_drafts.revision, person_select_shared_drafts.items,
      person_select_shared_drafts.customer_memo, person_select_shared_drafts.updated_at
    into revision, items, customer_memo, updated_at;
    return next;
    return;
  end if;

  if current_row.revision <> p_expected_revision then
    raise exception 'draft_revision_conflict' using errcode = 'PT409';
  end if;

  update public.person_select_shared_drafts
  set revision = current_row.revision + 1,
      items = p_items,
      customer_memo = p_customer_memo,
      updated_at = now()
  where event_id = p_event_id and reviewer_id = p_reviewer_id
  returning person_select_shared_drafts.revision, person_select_shared_drafts.items,
    person_select_shared_drafts.customer_memo, person_select_shared_drafts.updated_at
  into revision, items, customer_memo, updated_at;
  return next;
end $$;

revoke all on function public.save_person_select_shared_draft_v2(uuid,uuid,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_person_select_shared_draft_v2(uuid,uuid,bigint,jsonb,text) to service_role;
