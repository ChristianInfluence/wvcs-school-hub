create or replace function public.current_user_can_use_office_finance()
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
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (
          staff.can_use_office_payroll = true
          or staff.can_manage_users = true
        )
    );
$$;

grant execute on function public.current_user_can_use_office_finance() to authenticated;

drop policy if exists "Office payroll can read incidental invoices" on public.incidental_invoices;
create policy "Office payroll can read incidental invoices"
  on public.incidental_invoices for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office payroll can create incidental invoices" on public.incidental_invoices;
create policy "Office payroll can create incidental invoices"
  on public.incidental_invoices for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office payroll can update incidental invoices" on public.incidental_invoices;
create policy "Office payroll can update incidental invoices"
  on public.incidental_invoices for update
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office payroll can delete incidental invoices" on public.incidental_invoices;
create policy "Office payroll can delete incidental invoices"
  on public.incidental_invoices for delete
  to authenticated
  using (public.current_user_can_use_office_finance());
