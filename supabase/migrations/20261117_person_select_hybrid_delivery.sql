-- 고객별 보정본 50장 이하는 private Storage, 51장 이상은 NAS 원본 전달로 분기한다.
-- 운영 DB에는 검토 후 수동 적용한다. 기존 Storage 원본 경로와 전달 기록은 유지한다.

alter table public.person_select_delivery_versions
  alter column storage_path_original drop not null,
  add column if not exists source_virtual_path text;

alter table public.person_select_delivery_versions
  drop constraint if exists person_select_delivery_versions_original_source_check;
alter table public.person_select_delivery_versions
  add constraint person_select_delivery_versions_original_source_check
  check (
    nullif(btrim(coalesce(storage_path_original, '')), '') is not null
    or nullif(btrim(coalesce(source_virtual_path, '')), '') is not null
  );

create index if not exists person_select_delivery_versions_source_virtual_path_idx
  on public.person_select_delivery_versions(source_virtual_path)
  where source_virtual_path is not null;

comment on column public.person_select_delivery_versions.source_virtual_path is
  'Mac Studio 허용 루트 기준 가상 경로(root-N/...). 고객에게 노출하지 않고 51장 이상 NAS ZIP 전달에만 사용한다.';

notify pgrst, 'reload schema';
