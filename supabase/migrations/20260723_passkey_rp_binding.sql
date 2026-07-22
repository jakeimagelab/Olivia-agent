-- WebAuthn credentials are scoped to the relying-party domain where they were created.
-- Store that binding so preview, localhost, and production credentials are never mixed.
alter table public.admin_passkeys
  add column if not exists rp_id text,
  add column if not exists registration_origin text;

create index if not exists idx_admin_passkeys_rp_id
  on public.admin_passkeys(rp_id)
  where rp_id is not null;

notify pgrst, 'reload schema';
