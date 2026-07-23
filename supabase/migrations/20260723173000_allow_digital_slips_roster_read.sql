drop policy if exists "Admins can read student directory" on public.student_directory;
create policy "Digital slips staff can read student directory"
  on public.student_directory for select
  to authenticated
  using (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_digital_slips()
  );
