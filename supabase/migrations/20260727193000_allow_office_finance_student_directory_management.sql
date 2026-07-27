drop policy if exists "Admins can create student directory" on public.student_directory;
create policy "Office finance can create student directory"
  on public.student_directory for insert
  to authenticated
  with check (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_office_finance()
  );

drop policy if exists "Admins can update student directory" on public.student_directory;
create policy "Office finance can update student directory"
  on public.student_directory for update
  to authenticated
  using (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_office_finance()
  )
  with check (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_office_finance()
  );

drop policy if exists "Admins can delete student directory" on public.student_directory;
create policy "Office finance can delete student directory"
  on public.student_directory for delete
  to authenticated
  using (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_office_finance()
  );
