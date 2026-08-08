-- 고객관리 3단 워크스페이스 개편 1차 — 새 portal_publications 테이블을 만들지 않고
-- 기존 pcrm_publications(quote/contract가 이미 쓰고 있음)를 그대로 확장해서
-- conti/셀렉갤러리/RAW다운로드/1차보정/최종사진까지 "공개 관리" 발행 게이트로 재사용한다.

alter table public.pcrm_publications
  add column if not exists published_by text,
  add column if not exists revoked_at timestamptz;

alter table public.pcrm_publications
  drop constraint if exists pcrm_publications_status_check;
alter table public.pcrm_publications
  add constraint pcrm_publications_status_check
  check (status in (
    'draft', 'internal_review', 'published', 'viewed',
    'revision_requested', 'approved', 'completed', 'archived', 'revoked'
  ));

notify pgrst, 'reload schema';
