-- photo_galleries: 원본 전달(original) / 보정본 전달(retouched) 구분 컬럼
-- clients.original_photos_link / clients.retouched_photos_link 동기화 트리거(clients-financial-sync-triggers.sql)가
-- 이 컬럼으로 어느 필드에 반영할지 판단한다.
-- 테이블이 없는 프로젝트에서도 스크립트가 중단되지 않도록 존재 여부를 먼저 확인한다.

do $$
begin
  if to_regclass('public.photo_galleries') is null then
    raise notice '테이블 public.photo_galleries 이 없어 건너뜁니다.';
  else
    alter table public.photo_galleries add column if not exists gallery_type text default 'retouched';

    if not exists (select 1 from pg_constraint where conname = 'photo_galleries_gallery_type_check') then
      alter table public.photo_galleries add constraint photo_galleries_gallery_type_check
        check (gallery_type in ('original', 'retouched'));
    end if;

    comment on column public.photo_galleries.gallery_type is
      '원본 전달(original) / 보정본 전달(retouched) 구분 — clients.original_photos_link, retouched_photos_link 동기화에 사용';
  end if;
end $$;

notify pgrst, 'reload schema';
