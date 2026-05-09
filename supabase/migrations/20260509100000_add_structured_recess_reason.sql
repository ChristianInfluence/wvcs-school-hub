alter table public.structured_recess_entries
  add column if not exists reason text;
