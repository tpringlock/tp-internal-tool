-- Contact fields imported from the accounting system's customer list
-- (scripts/import-clients.mjs). Nullable free-text; the admin client form
-- doesn't expose them yet.
alter table public.clients
  add column if not exists address text,
  add column if not exists tax_code text,
  add column if not exists phone text;
