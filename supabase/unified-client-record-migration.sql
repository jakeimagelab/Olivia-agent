-- 고객정보 통합 (Unified Client Record)
-- 모든 컬럼/인덱스는 순수 additive (add column if not exists) — 기존 데이터/기능을 건드리지 않는다.
-- Supabase SQL Editor에서 실행하세요 (clients-columns-migration.sql과 동일한 관례).

-- ── 1. clients: 원본/보정 사진 공유 링크 (최신 1건을 들고 있는 편의 컬럼) ──
alter table public.clients add column if not exists original_photos_link  text;
alter table public.clients add column if not exists retouched_photos_link text;

-- ── 2. quotes / contracts / mailing_queue / mailing_logs: client_id 연결 ──
alter table public.quotes        add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.contracts     add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.mailing_queue add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.mailing_logs  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists quotes_client_id_idx        on public.quotes(client_id);
create index if not exists contracts_client_id_idx      on public.contracts(client_id);
create index if not exists mailing_queue_client_id_idx  on public.mailing_queue(client_id);
create index if not exists mailing_logs_client_id_idx   on public.mailing_logs(client_id);

-- ── 3. 과거 데이터 best-effort 백필 ──
-- 병원명 공백/대소문자 차이를 무시하고, clients.name과 "정확히 하나"만 매칭될 때만 연결한다.
-- 동명이인(같은 이름의 병원이 여러 건) 또는 매칭 실패는 그대로 null로 남긴다 — 잘못 연결하는 것보다 안전.
create or replace function public.normalize_name(input text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(input, ''), '\s+', '', 'g'));
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['quotes', 'contracts', 'mailing_queue', 'mailing_logs'] loop
    execute format($f$
      update public.%I t
      set client_id = m.id
      from (
        select id, public.normalize_name(name) as norm
        from public.clients
      ) m
      where t.client_id is null
        and t.hospital_name is not null
        and t.hospital_name <> ''
        and public.normalize_name(t.hospital_name) = m.norm
        and (
          select count(*) from public.clients c2
          where public.normalize_name(c2.name) = public.normalize_name(t.hospital_name)
        ) = 1
    $f$, tbl);
  end loop;
end $$;
