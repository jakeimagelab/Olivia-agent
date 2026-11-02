-- 개인별 사진 셀렉: 고객 안내 문구와 추가 주문 (2026-11-01)
-- 행사마다 안내 문구·추가 보정 가격·상품 목록을 두고, 사람마다 추가 주문 내역을 저장한다.
-- 금액 합계는 저장하지 않고 볼 때마다 상품 목록과 고른 장수로 다시 계산한다.

alter table public.person_select_events add column if not exists offer_notice text not null default '';
alter table public.person_select_events add column if not exists extra_price integer not null default 0;
alter table public.person_select_events add column if not exists extra_max integer not null default 0;
alter table public.person_select_events add column if not exists offers jsonb not null default '[]'::jsonb;

alter table public.person_select_people add column if not exists orders jsonb not null default '[]'::jsonb;
alter table public.person_select_people add column if not exists orders_updated_at timestamptz;

notify pgrst, 'reload schema';
