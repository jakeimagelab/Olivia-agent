alter table public.video_conti
  add column if not exists storyboard_rows integer,
  add column if not exists storyboard_cols integer,
  add column if not exists storyboard_captions jsonb default '[]'::jsonb;
