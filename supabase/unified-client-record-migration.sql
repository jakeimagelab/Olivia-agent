-- 고객정보 통합 (Unified Client Record)
-- 모든 컬럼/인덱스는 순수 additive (add column if not exists) — 기존 데이터/기능을 건드리지 않는다.
-- Supabase SQL Editor에서 실행하세요 (clients-columns-migration.sql과 동일한 관례).
-- quotes/contracts/mailing_queue/mailing_logs 중 프로젝트에 없는 테이블이 있어도 스크립트 전체가
-- 중단되지 않도록 테이블 존재 여부를 먼저 확인하고 건너뛴다 (Supabase SQL Editor는 붙여넣은 스크립트
-- 전체를 하나의 트랜잭션으로 실행하므로, 테이블 하나가 없어서 에러가 나면 이미 실행된 문장까지
-- 전부 롤백된다 — 그래서 이번엔 to_regclass로 먼저 체크한다).

-- ── 1. clients: 원본/보정 사진 공유 링크 (최신 1건을 들고 있는 편의 컬럼) ──
alter table if exists public.clients add column if not exists original_photos_link  text;
alter table if exists public.clients add column if not exists retouched_photos_link text;

-- ── 2. quotes / contracts / mailing_queue / mailing_logs: client_id 연결 + 인덱스 + 과거 데이터 백필 ──
-- 병원명 공백/대소문자 차이를 무시하고, clients.hospital_name과 "정확히 하나"만 매칭될 때만 연결한다.
-- (clients 테이블의 병원명 컬럼은 hospital_name이다 — app/api/clients/route.ts, app/api/clients/[id]/route.ts의
-- "실제 DB 컬럼" 주석 참고. schema.sql 문서상 이름과 실제 라이브 스키마가 다르므로 반드시 이 컬럼명을 쓴다.)
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
    if to_regclass('public.' || tbl) is null then
      raise notice '테이블 public.% 이 없어 건너뜁니다.', tbl;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists client_id uuid references public.clients(id) on delete set null',
      tbl
    );
    execute format(
      'create index if not exists %I on public.%I(client_id)',
      tbl || '_client_id_idx', tbl
    );

    -- hospital_name 컬럼이 없는 테이블(있을 리 없지만 방어적으로)이면 백필은 건너뛴다.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'hospital_name'
    ) then
      continue;
    end if;

    execute format($f$
      update public.%I t
      set client_id = m.id
      from (
        select id, public.normalize_name(hospital_name) as norm
        from public.clients
      ) m
      where t.client_id is null
        and t.hospital_name is not null
        and t.hospital_name <> ''
        and public.normalize_name(t.hospital_name) = m.norm
        and (
          select count(*) from public.clients c2
          where public.normalize_name(c2.hospital_name) = public.normalize_name(t.hospital_name)
        ) = 1
    $f$, tbl);
  end loop;
end $$;
