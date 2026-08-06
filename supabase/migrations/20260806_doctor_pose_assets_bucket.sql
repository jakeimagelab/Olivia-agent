-- 원장 포즈 선화 이미지(정적 에셋) 저장용 공개 버킷.
-- 환자/고객 데이터가 아니라 고정된 6가지 일러스트 이미지만 저장하므로 공개 버킷으로 둔다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('youtube-editing-assets', 'youtube-editing-assets', true, 10485760, array['image/png'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
