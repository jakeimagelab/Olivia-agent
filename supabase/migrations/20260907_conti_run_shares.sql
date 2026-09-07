-- 7단계 — 신규 콘티(conti_runs) 공유 링크. 옛 conti_shares(conti_saves의 ContiResult jsonb
-- 스냅샷)와는 별개다 — 이쪽은 run_id를 참조해서 항상 최신 상태를 보여준다.
-- audience로 고객용/현장팀용을 구분한다: 고객용은 keyword·환자역할을 숨긴다(공개 페이지에서
-- 필터링, DB에는 전체를 그대로 둔다 — 이후 audience별 필드 정책이 바뀌어도 재발급 불필요).
create table if not exists public.conti_run_shares (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.conti_runs(id) on delete cascade,
  audience    text not null check (audience in ('customer', 'staff')),
  token       text not null unique,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists conti_run_shares_run_idx on public.conti_run_shares(run_id);

alter table public.conti_run_shares enable row level security;

drop policy if exists "service role full access conti run shares" on public.conti_run_shares;
create policy "service role full access conti run shares" on public.conti_run_shares for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
