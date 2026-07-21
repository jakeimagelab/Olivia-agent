-- 프롬프터 대본을 "프로젝트(병원/기업 단위) > 씬(개별 촬영 대본)" 2단 구조로 바꾼다.
create table if not exists public.prompter_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.prompter_scripts add column if not exists project_id uuid references public.prompter_projects(id) on delete cascade;
alter table public.prompter_scripts add column if not exists editor_mode text not null default 'text';
create index if not exists prompter_scripts_project_id_idx on public.prompter_scripts(project_id);

-- 기존에 프로젝트 없이 만들어졌던 씬들은 "미분류 프로젝트" 하나로 묶어서 데이터 유실 없이 이관한다
-- (이름은 화면에서 바로 바꿀 수 있음 — 예: "미소로한의원"으로 이름만 바꾸면 끝).
do $$
declare
  fallback_project_id uuid;
begin
  if exists (select 1 from public.prompter_scripts where project_id is null) then
    insert into public.prompter_projects (name) values ('미분류 프로젝트')
    returning id into fallback_project_id;

    update public.prompter_scripts set project_id = fallback_project_id where project_id is null;
  end if;
end $$;

notify pgrst, 'reload schema';
