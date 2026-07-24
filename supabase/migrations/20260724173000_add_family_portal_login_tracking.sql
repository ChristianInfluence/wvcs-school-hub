alter table public.family_portal_access
  add column if not exists last_parent_login_at timestamptz,
  add column if not exists last_parent_login_email text;
