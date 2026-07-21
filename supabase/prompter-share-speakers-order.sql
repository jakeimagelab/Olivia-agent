-- 프롬프터: 외부 공유 격리(share_token) + 다중 화자(speakers/speaker_map) + 씬 정렬순서(sort_order)

-- 1) 외부 공유 링크로 만들어진 프로젝트를 실제 관리자 데이터와 완전히 분리한다.
--    share_token이 null이면 관리자(정식) 프로젝트, 값이 있으면 그 공유 세션 전용 프로젝트.
alter table public.prompter_projects add column if not exists share_token text;
create index if not exists prompter_projects_share_token_idx on public.prompter_projects(share_token);

-- 2) 다중 화자 지정 — 프로젝트 단위로 화자(이름/색상) 목록을 두고,
--    씬(대본)마다 문단별로 어떤 화자인지 매핑을 저장한다.
alter table public.prompter_projects add column if not exists speakers jsonb not null default '[]'::jsonb;
alter table public.prompter_scripts add column if not exists speaker_map jsonb not null default '[]'::jsonb;

-- 3) 씬 드래그 순서 변경을 저장할 컬럼.
alter table public.prompter_scripts add column if not exists sort_order integer not null default 0;
create index if not exists prompter_scripts_sort_order_idx on public.prompter_scripts(project_id, sort_order);

-- 기존 씬들은 프로젝트별로 생성일 순서를 기준으로 sort_order를 채워준다 (전부 0인 상태 그대로 두면
-- 화면에서 순서가 뒤섞여 보이므로, 처음 한 번만 안전하게 초기값을 매겨준다).
with ranked as (
  select id, row_number() over (partition by project_id order by created_at asc) - 1 as rn
  from public.prompter_scripts
)
update public.prompter_scripts s
set sort_order = ranked.rn
from ranked
where s.id = ranked.id and s.sort_order = 0;

notify pgrst, 'reload schema';
