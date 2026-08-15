-- photo_galleries.gallery_type: 원본사진/원본영상/완료사진/완료영상 4종류로 확장
-- (코드 요청서 2차 3번 항목, 2026-08-16). 기존 'original'/'retouched' 값은 하위호환을 위해
-- 그대로 허용하고(과거 등록 데이터를 깨뜨리지 않음), 앱에서는 새 4개 값만 선택지로 노출한다.
-- clients.original_photos_link / retouched_photos_link 동기화 트리거도 새 값을 인식하도록 갱신한다.

do $$
begin
  if to_regclass('public.photo_galleries') is null then
    raise notice '테이블 public.photo_galleries 이 없어 건너뜁니다.';
  else
    alter table public.photo_galleries drop constraint if exists photo_galleries_gallery_type_check;
    alter table public.photo_galleries add constraint photo_galleries_gallery_type_check
      check (gallery_type in ('original', 'retouched', 'original_photo', 'original_video', 'final_photo', 'final_video'));

    comment on column public.photo_galleries.gallery_type is
      '원본 전달(original_photo/original_video, 구값 original) / 완료본 전달(final_photo/final_video, 구값 retouched) 구분 — clients.original_photos_link, retouched_photos_link 동기화 및 워크플로우 client_selection/retouching/final_delivery 단계 자동완료 판단에 사용';
  end if;
end $$;

-- gallery_type='original' 계열이면 원본 링크로, 그 외(final/retouched 계열)는 완료본 링크로 동기화.
create or replace function public.sync_gallery_to_client()
returns trigger language plpgsql as $$
begin
  if new.client_id is not null then
    if new.gallery_type in ('original', 'original_photo', 'original_video') then
      update public.clients set original_photos_link = new.nas_link, updated_at = now() where id = new.client_id;
    else
      update public.clients set retouched_photos_link = new.nas_link, updated_at = now() where id = new.client_id;
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
