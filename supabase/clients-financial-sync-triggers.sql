-- 견적/계약/갤러리 저장 시 clients에 자동 반영 (DB 트리거로 통합)
-- 챗봇 경로(lib/olivia/crud/executor.ts)와 웹 UI 경로(app/api/quotes, app/api/contracts, app/api/galleries)가
-- 각각 따로 clients를 갱신하던 걸 걷어내고, 어느 경로로 저장하든 DB 트리거 하나가 보장하도록 통합한다.
-- 모든 문장은 additive/idempotent이고, 대상 테이블이 없으면 건너뛴다 (quotes/contracts가 없는 프로젝트에서도 안전).

-- ── 1. clients: 견적/계약 요약 컬럼 (전부 additive) ──
alter table if exists public.clients
  add column if not exists quote_id           uuid,
  add column if not exists quote_amount       numeric,        -- 부가세 별도 공급가액
  add column if not exists quote_vat          numeric,
  add column if not exists quote_total        numeric,        -- 부가세 포함 총액
  add column if not exists contract_id        uuid,
  add column if not exists contract_amount    numeric,        -- 부가세 별도 공급가액
  add column if not exists contract_vat       numeric,
  add column if not exists contract_total     numeric,        -- 부가세 포함 총액
  add column if not exists contract_signed_at timestamptz;

-- quotes/contracts가 없는 프로젝트에서는 FK를 걸 수 없으므로, 두 테이블이 있을 때만 참조 제약을 추가한다.
do $$
begin
  if to_regclass('public.quotes') is not null
     and not exists (select 1 from pg_constraint where conname = 'clients_quote_id_fkey') then
    alter table public.clients add constraint clients_quote_id_fkey
      foreign key (quote_id) references public.quotes(id) on delete set null;
  end if;
  if to_regclass('public.contracts') is not null
     and not exists (select 1 from pg_constraint where conname = 'clients_contract_id_fkey') then
    alter table public.clients add constraint clients_contract_id_fkey
      foreign key (contract_id) references public.contracts(id) on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ── 2. 견적 저장 시 clients 반영 (quotes 컬럼은 전부 snake_case: supply_amount/vat/total_amount) ──
create or replace function public.sync_quote_to_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null then
    update public.clients set
      quote_id     = new.id,
      quote_amount = new.supply_amount,
      quote_vat    = new.vat,
      quote_total  = new.total_amount,
      updated_at   = now()
    where id = new.client_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.quotes') is not null then
    drop trigger if exists trg_sync_quote_to_client on public.quotes;
    create trigger trg_sync_quote_to_client
      after insert or update on public.quotes
      for each row execute function public.sync_quote_to_client();
  else
    raise notice '테이블 public.quotes 이 없어 트리거 생성을 건너뜁니다.';
  end if;
end $$;

-- ── 3. 계약 저장/서명 시 clients 반영 ──
-- quote_data(jsonb)는 app/contract/page.tsx가 프론트 quote 객체(QuoteData)를 그대로 저장한 것이라
-- camelCase 키(supplyAmount/vat/totalAmount)로 확인됨 (2026-07-19 app/contract/page.tsx 실제 코드 확인).
-- 혹시 다른 경로에서 snake_case로 저장하는 경우까지 대비해 coalesce로 양쪽 다 확인한다.
create or replace function public.sync_contract_to_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null then
    update public.clients set
      contract_id        = new.id,
      contract_amount     = coalesce((new.quote_data->>'supplyAmount')::numeric, (new.quote_data->>'supply_amount')::numeric),
      contract_vat         = (new.quote_data->>'vat')::numeric,
      contract_total       = coalesce((new.quote_data->>'totalAmount')::numeric, (new.quote_data->>'total_amount')::numeric),
      contract_signed_at   = case when new.signature_data_url is not null and contract_signed_at is null then now() else contract_signed_at end,
      updated_at            = now()
    where id = new.client_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.contracts') is not null then
    drop trigger if exists trg_sync_contract_to_client on public.contracts;
    create trigger trg_sync_contract_to_client
      after insert or update on public.contracts
      for each row execute function public.sync_contract_to_client();
  else
    raise notice '테이블 public.contracts 이 없어 트리거 생성을 건너뜁니다.';
  end if;
end $$;

-- ── 4. 갤러리(원본/보정) NAS 링크를 gallery_type에 맞춰 정확히 반영 ──
-- photo-galleries-type-migration.sql로 gallery_type 컬럼이 먼저 추가되어 있어야 한다.
create or replace function public.sync_gallery_to_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null then
    if new.gallery_type = 'original' then
      update public.clients set original_photos_link = new.nas_link, updated_at = now() where id = new.client_id;
    else
      update public.clients set retouched_photos_link = new.nas_link, updated_at = now() where id = new.client_id;
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.photo_galleries') is not null then
    drop trigger if exists trg_sync_gallery_to_client on public.photo_galleries;
    create trigger trg_sync_gallery_to_client
      after insert or update on public.photo_galleries
      for each row execute function public.sync_gallery_to_client();
  else
    raise notice '테이블 public.photo_galleries 이 없어 트리거 생성을 건너뜁니다.';
  end if;
end $$;
