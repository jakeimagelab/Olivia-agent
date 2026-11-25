alter table public.transaction_statements
  add column if not exists business_details jsonb not null default '{}'::jsonb,
  add column if not exists registration_documents jsonb not null default '{}'::jsonb,
  add column if not exists receipt_mode text not null default 'confirm' check (receipt_mode in ('confirm', 'sign')),
  add column if not exists signed_pdf_path text;

grant update (business_details, registration_documents, receipt_mode, signed_pdf_path)
  on public.transaction_statements to service_role;

notify pgrst, 'reload schema';
