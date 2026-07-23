alter table public.staff_access
  add column if not exists can_manage_users boolean not null default false;

update public.staff_access
set can_manage_users = true,
    can_use_hub = true,
    can_use_admin = true,
    updated_at = now()
where email = 'mconniry@wvcs.org';

create or replace function public.current_user_can_manage_staff_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(auth.jwt() ->> 'email') = 'mconniry@wvcs.org'
    or exists (
      select 1
      from public.staff_access
      where email = lower(auth.jwt() ->> 'email')
        and can_use_hub = true
        and can_manage_users = true
    );
$$;

grant execute on function public.current_user_can_manage_staff_access() to authenticated;

drop policy if exists "Authenticated users can read staff access" on public.staff_access;
create policy "Authenticated users can read staff access"
  on public.staff_access for select
  to authenticated
  using (
    email = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can create staff access" on public.staff_access;
drop policy if exists "Superusers can create staff access" on public.staff_access;
create policy "Superusers can create staff access"
  on public.staff_access for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update staff access" on public.staff_access;
drop policy if exists "Superusers can update staff access" on public.staff_access;
create policy "Superusers can update staff access"
  on public.staff_access for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (
    public.current_user_can_manage_staff_access()
    and (
      email <> 'mconniry@wvcs.org'
      or can_manage_users = true
    )
  );

drop policy if exists "Admins can delete staff access" on public.staff_access;
drop policy if exists "Superusers can delete staff access" on public.staff_access;
create policy "Superusers can delete staff access"
  on public.staff_access for delete
  to authenticated
  using (
    email <> 'mconniry@wvcs.org'
    and public.current_user_can_manage_staff_access()
  );
