-- 프롬프터(Teleprompter) 대본 저장 — 병원별로 여러 촬영 대본을 저장해뒀다가 다시 불러와 쓴다.
create table if not exists public.prompter_scripts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete set null,
  title       text not null default '제목 없는 대본',
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prompter_scripts_client_id_idx on public.prompter_scripts(client_id);

notify pgrst, 'reload schema';
