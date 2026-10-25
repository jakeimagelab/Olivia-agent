-- 장비 마스터 v2. 기존 행은 과거 일정 참조를 보존하기 위해 삭제하지 않는다.
alter table public.equipment
  add column if not exists quantity integer not null default 1,
  add column if not exists usage text,
  add column if not exists note text;

-- 기존 제약이 STORAGE 값을 허용하지 않으므로 제약을 먼저 제거한 뒤 값을 옮긴다.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.equipment'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.equipment drop constraint %I', constraint_name);
  end loop;
end $$;

update public.equipment
set category = 'STORAGE', updated_at = now()
where category = 'COMPUTER';

alter table public.equipment
  add constraint equipment_category_check
  check (category in (
    'CAMERA', 'LENS', 'LIGHT', 'STAND', 'TRIPOD', 'SLIDER',
    'GIMBAL', 'TRIGGER', 'BATTERY', 'STORAGE', 'ETC'
  ));

update public.equipment set active = false, updated_at = now();

create temporary table equipment_list_v2 (
  sort_order integer primary key,
  category text not null,
  name text not null,
  quantity integer not null,
  usage text,
  note text,
  legacy_name text
);

insert into equipment_list_v2 (sort_order, category, name, quantity, usage, note, legacy_name) values
  (1, 'CAMERA', 'Sony a7R5', 1, '사진/영상', null, 'Sony A7R V'),
  (2, 'CAMERA', 'Sony a7M4', 1, '사진', null, 'Sony A7 IV'),
  (3, 'CAMERA', 'Canon 5DMK4', 1, '사진 > 프로필, 인테리어', null, 'Canon 5D Mark IV'),
  (4, 'LENS', 'Canon 16-35mm L', 1, '인테리어', null, 'Canon 16-35'),
  (5, 'LENS', 'Canon 24-70mm L', 1, '프로필', null, 'Canon 24-70'),
  (6, 'LENS', 'Sony 35mm GM', 1, null, '연출사진에서 메인렌즈', 'Sony 35'),
  (7, 'LENS', 'Sony 85mm GM', 1, null, '연출에서 클로즈업', 'Sony 85'),
  (8, 'LENS', 'Sony 24-70mm GM2', 1, null, '영상에서 메인렌즈', 'Sony 24-70'),
  (9, 'LENS', 'Sony 135mm GM', 1, null, '행사촬영에 망원으로 사용', 'Sony 135'),
  (10, 'LIGHT', 'Profoto A10', 2, '연출사진', null, 'Profoto A10 Duo Kit'),
  (11, 'LIGHT', 'Profoto B10x', 2, '연출사진 / 단체사진', null, 'Profoto B10X Duo Kit'),
  (12, 'LIGHT', 'Rimelight i6 TTL', 2, '스튜디오셋팅', '오로라 90x120 사각 소프트박스', '라임라이트 i6 TTL'),
  (13, 'LIGHT', 'Rimelight i4 TTL', 2, '스튜디오셋팅', null, '라임라이트 i4 TTL'),
  (14, 'LIGHT', 'Godox E300', 1, '영상조명', null, null),
  (15, 'STAND', 'Silver Stand', 2, '연출사진', 'A10은 가벼워서 실버 스탠드로 충분', null),
  (16, 'STAND', 'Black Aurora', 2, '보조', '튼튼해서 프로필 촬영 · B10x에 사용', null),
  (17, 'TRIPOD', 'Sirui for Movie', 1, null, null, '시루이 영상 삼각대'),
  (18, 'TRIPOD', 'Sirui for Photo', 1, null, null, '시루이 사진 삼각대'),
  (19, 'SLIDER', 'E700', 1, '필요시 렌트', null, null),
  (20, 'GIMBAL', 'Ronin 4 Mini', 1, '영상 촬영에 사용', 'Sony a7R5 + 2470렌즈와 사용', 'DJI Ronin 4 Mini'),
  (21, 'TRIGGER', 'Profoto Connect Pro', 1, null, '사진촬영 > a7R5 마운트, 영상촬영 > a7M4 마운트', 'Profoto Connect Pro'),
  (22, 'TRIGGER', 'Profoto Connect for Sony', 1, null, '여분 · 보조', 'Profoto Connect Sony'),
  (23, 'TRIGGER', 'Profoto Connect for Canon', 1, null, null, 'Profoto Connect Canon'),
  (24, 'TRIGGER', 'TS-5 for Canon', 1, '라임라이트용', null, null),
  (25, 'TRIGGER', 'TS-5 for Sony', 1, '라임라이트용', null, null),
  (26, 'BATTERY', 'Sony Battery', 4, null, null, null),
  (27, 'BATTERY', 'Canon Battery', 3, '세로그립에 2개 사용', null, null),
  (28, 'BATTERY', '프로포토 A10 배터리', 3, null, '2개 사용, 1개는 충전', null),
  (29, 'BATTERY', '프로포토 B10 배터리', 2, null, '2개 사용, 배터리 오래감', null),
  (30, 'STORAGE', 'Lexar CFex A type 80Gb', 2, null, '렉사는 소니카메라용', 'Lexar Type A 80GB'),
  (31, 'STORAGE', 'Lexar SD 64Gb', 1, null, null, 'Lexar SD 64GB'),
  (32, 'STORAGE', 'Lexar SD 32Gb', 1, null, null, 'Lexar SD 32GB'),
  (33, 'STORAGE', 'Sony SD 128Gb', 1, null, '소니는 캐논카메라용', 'Sony SD 128GB'),
  (34, 'STORAGE', 'Sony SD 64Gb', 1, null, null, 'Sony SD 64GB'),
  (35, 'ETC', '아이패드', 1, '콘티용', '자주 충전해야 함', 'iPad Pro 12.9"');

-- 기존 이름을 우선 재사용한다. 재실행 때는 이미 바뀐 현재 이름을 재사용한다.
do $$
declare
  item equipment_list_v2%rowtype;
  equipment_id uuid;
begin
  for item in select * from equipment_list_v2 order by sort_order loop
    equipment_id := null;
    if item.legacy_name is not null then
      select id into equipment_id
      from public.equipment
      where name = item.legacy_name
      order by created_at
      limit 1;
    end if;
    if equipment_id is null then
      select id into equipment_id
      from public.equipment
      where name = item.name
      order by created_at
      limit 1;
    end if;

    if equipment_id is null then
      insert into public.equipment (name, category, quantity, usage, note, active, sort_order, updated_at)
      values (item.name, item.category, item.quantity, item.usage, item.note, true, item.sort_order, now());
    else
      update public.equipment
      set name = item.name,
          category = item.category,
          quantity = item.quantity,
          usage = item.usage,
          note = item.note,
          active = true,
          sort_order = item.sort_order,
          updated_at = now()
      where id = equipment_id;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 적용 확인: active_count가 35이고 missing_count가 0이어야 한다.
select
  (select count(*) from public.equipment where active = true) as active_count,
  (select count(*) from equipment_list_v2 seed
    where not exists (
      select 1 from public.equipment equipment
      where equipment.active = true and equipment.name = seed.name
    )) as missing_count,
  (select coalesce(array_agg(seed.name order by seed.sort_order), array[]::text[])
    from equipment_list_v2 seed
    where not exists (
      select 1 from public.equipment equipment
      where equipment.active = true and equipment.name = seed.name
    )) as missing_names;
