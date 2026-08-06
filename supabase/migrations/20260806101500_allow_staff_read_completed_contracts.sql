drop policy if exists "Staff can read own completed contracts" on public.staff_contracts;
create policy "Staff can read own completed contracts"
  on public.staff_contracts for select
  to authenticated
  using (
    lower(staff_email) = lower(auth.jwt() ->> 'email')
    and status = 'Complete'
  );
