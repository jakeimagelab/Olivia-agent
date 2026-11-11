create index if not exists remote_jobs_created_at_idx on public.remote_jobs (created_at desc);
create index if not exists remote_jobs_action_created_idx on public.remote_jobs (action, created_at desc);
create index if not exists remote_jobs_status_created_idx on public.remote_jobs (status, created_at);
create index if not exists person_select_images_event_sort_idx on public.person_select_images (event_id, sort_order, id);
create index if not exists person_select_choices_event_idx on public.person_select_choices (event_id, id);
create index if not exists person_select_people_event_idx on public.person_select_people (event_id);
create index if not exists select_gallery_images_gallery_idx on public.select_gallery_images (gallery_id, id);
