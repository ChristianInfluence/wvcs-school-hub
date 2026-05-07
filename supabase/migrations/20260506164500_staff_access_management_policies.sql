drop policy if exists "Authenticated users can read staff access" on public.staff_access;
create policy "Authenticated users can read staff access"
  on public.staff_access for select
  to authenticated
  using (true);

drop policy if exists "Admins can create staff access" on public.staff_access;
create policy "Admins can create staff access"
  on public.staff_access for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_access current_user_access
      where current_user_access.email = lower(auth.jwt() ->> 'email')
        and current_user_access.can_use_admin = true
    )
  );

drop policy if exists "Admins can update staff access" on public.staff_access;
create policy "Admins can update staff access"
  on public.staff_access for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access current_user_access
      where current_user_access.email = lower(auth.jwt() ->> 'email')
        and current_user_access.can_use_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.staff_access current_user_access
      where current_user_access.email = lower(auth.jwt() ->> 'email')
        and current_user_access.can_use_admin = true
    )
  );

drop policy if exists "Admins can delete staff access" on public.staff_access;
create policy "Admins can delete staff access"
  on public.staff_access for delete
  to authenticated
  using (
    email <> 'mconniry@wvcs.org'
    and exists (
      select 1
      from public.staff_access current_user_access
      where current_user_access.email = lower(auth.jwt() ->> 'email')
        and current_user_access.can_use_admin = true
    )
  );
