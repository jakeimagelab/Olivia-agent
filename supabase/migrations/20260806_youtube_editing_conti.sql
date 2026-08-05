-- 유튜브 편집 콘티 분석기
-- 라이브러리(library_items)와 동일하게 RLS 없이 미들웨어(ADMIN_PASSWORD) + service role 접근 패턴을 따른다.

create table if not exists public.youtube_editing_projects (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default '',
  hospital_name   text,
  full_script     text not null default '',
  video_ratio     text not null default '16:9' check (video_ratio in ('16:9', '9:16')),
  preferred_tone  text,
  status          text not null default 'draft' check (status in ('draft', 'analyzing', 'ready', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.youtube_editing_segments (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.youtube_editing_projects(id) on delete cascade,
  sort_order              integer not null default 0,
  script_text             text not null default '',
  estimated_duration_sec  numeric,
  camera                  jsonb not null default '[]',
  caption                 jsonb not null default '{}',
  visual                  jsonb not null default '{}',
  sound_effect            jsonb not null default '{}',
  transition              jsonb not null default '{}',
  template                jsonb not null default '{}',
  editing_note            text,
  ai_reason               text,
  confidence              numeric,
  ai_result               jsonb,
  user_modified           boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.youtube_editing_annotations (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.youtube_editing_projects(id) on delete cascade,
  segment_id     uuid not null unique references public.youtube_editing_segments(id) on delete cascade,
  strokes        jsonb not null default '[]',
  canvas_width   integer,
  canvas_height  integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.youtube_editing_canvas_objects (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.youtube_editing_projects(id) on delete cascade,
  segment_id   uuid not null references public.youtube_editing_segments(id) on delete cascade,
  object_type  text not null,
  object_data  jsonb not null default '{}',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_youtube_editing_segments_project on public.youtube_editing_segments(project_id, sort_order);
create index if not exists idx_youtube_editing_annotations_segment on public.youtube_editing_annotations(segment_id);
create index if not exists idx_youtube_editing_canvas_objects_segment on public.youtube_editing_canvas_objects(segment_id, sort_order);

notify pgrst, 'reload schema';
