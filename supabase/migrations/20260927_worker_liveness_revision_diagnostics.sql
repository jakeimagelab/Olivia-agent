-- Mac Studio watcher activity and installed-code diagnostics.

alter table public.remote_workers
  add column if not exists watcher_progress jsonb,
  add column if not exists worker_rev text,
  add column if not exists worker_installed_at timestamptz;

comment on column public.remote_workers.watcher_progress is
  'Latest bounded NAS watcher scan/stabilization snapshot reported through worker polling.';

comment on column public.remote_workers.worker_rev is
  'Git commit installed in ~/OliviaWorker/bin by install-worker-bin.sh.';
