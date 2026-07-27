create policy "Office finance can read permission events"
  on public.permission_events for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

create policy "Office finance can read permission recipients"
  on public.permission_recipients for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

create policy "Office finance can read permission submissions"
  on public.permission_submissions for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

create policy "Office finance can read form submissions"
  on public.form_submissions for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());
