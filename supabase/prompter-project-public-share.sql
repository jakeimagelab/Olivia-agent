-- 프롬프터: 특정 프로젝트를 통째로(실제 씬 그대로) 외부에 전체 공유하는 기능.
-- 기존 share_token 컬럼은 "공유 세션이 새로 만든 프로젝트(빈 상태)"를 표시하는 용도라서,
-- "관리자의 실제 프로젝트를 그대로 공유"하는 건 별도 컬럼으로 분리한다 — 안 그러면
-- 관리자 목록 조회(share_token is null)에서 공유한 프로젝트가 사라져 버린다.
alter table public.prompter_projects add column if not exists public_share_token text;
create index if not exists prompter_projects_public_share_token_idx on public.prompter_projects(public_share_token);

notify pgrst, 'reload schema';
