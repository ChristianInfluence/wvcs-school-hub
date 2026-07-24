alter table public.family_portal_access
  add column if not exists fos_liability_amount numeric(8,2) not null default 500,
  add column if not exists fos_hour_value numeric(6,2) not null default 10;

alter table public.family_portal_access
  drop constraint if exists family_portal_access_fos_amounts_check;

alter table public.family_portal_access
  add constraint family_portal_access_fos_amounts_check
  check (fos_liability_amount >= 0 and fos_hour_value > 0);
