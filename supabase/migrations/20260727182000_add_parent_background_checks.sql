create table if not exists public.parent_background_checks (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null default '',
  parent_name text not null default '',
  parent_email text not null,
  verified_at date not null default current_date,
  expires_at date not null,
  status text not null default 'Verified',
  office_note text not null default '',
  verified_by_email text,
  updated_at timestamptz not null default now(),
  constraint parent_background_checks_status_check
    check (status in ('Verified', 'Expired', 'Revoked'))
);

create unique index if not exists parent_background_checks_family_email_uidx
  on public.parent_background_checks (family_key, parent_email);

create index if not exists parent_background_checks_expiration_idx
  on public.parent_background_checks (expires_at, status);

alter table public.parent_background_checks enable row level security;

drop policy if exists "Office finance can read background checks" on public.parent_background_checks;
create policy "Office finance can read background checks"
  on public.parent_background_checks for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

drop policy if exists "Office finance can create background checks" on public.parent_background_checks;
create policy "Office finance can create background checks"
  on public.parent_background_checks for insert
  to authenticated
  with check (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

drop policy if exists "Office finance can update background checks" on public.parent_background_checks;
create policy "Office finance can update background checks"
  on public.parent_background_checks for update
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access())
  with check (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

grant select, insert, update on public.parent_background_checks to authenticated;

create or replace function public.touch_parent_background_checks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_parent_background_checks_updated_at on public.parent_background_checks;
create trigger touch_parent_background_checks_updated_at
  before update on public.parent_background_checks
  for each row
  execute function public.touch_parent_background_checks_updated_at();
