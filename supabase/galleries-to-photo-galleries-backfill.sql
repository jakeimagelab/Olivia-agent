-- 0. 먼저 galleries 테이블에 실제로 데이터가 몇 건 있는지 확인 (몇 건 안 되면 수동 확인 후 실행 추천)
select count(*) from public.galleries;

-- 1. 죽은 galleries 테이블의 데이터를 실제로 쓰이는 photo_galleries로 이관합니다.
insert into public.photo_galleries (client_id, hospital_name, description, nas_link, gallery_type, shoot_date, created_at)
select
  g.hospital_id,
  g.hospital_name,
  g.title,
  coalesce(g.original_link, g.retouched_link, g.gallery_link),
  case when g.original_link is not null and g.retouched_link is null then 'original' else 'retouched' end,
  g.shoot_date,
  g.created_at
from public.galleries g
where g.hospital_id is not null
  and coalesce(g.original_link, g.retouched_link, g.gallery_link) is not null
  and not exists (
    select 1 from public.photo_galleries pg
    where pg.client_id = g.hospital_id
      and pg.nas_link = coalesce(g.original_link, g.retouched_link, g.gallery_link)
  );

-- 확인
select count(*) from public.photo_galleries where nas_link is not null;
