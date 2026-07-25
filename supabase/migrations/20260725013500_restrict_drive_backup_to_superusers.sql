drop policy if exists "Admins can read drive backup settings" on public.drive_backup_settings;
drop policy if exists "Superusers can read drive backup settings" on public.drive_backup_settings;
create policy "Superusers can read drive backup settings"
  on public.drive_backup_settings for select
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can create drive backup settings" on public.drive_backup_settings;
drop policy if exists "Superusers can create drive backup settings" on public.drive_backup_settings;
create policy "Superusers can create drive backup settings"
  on public.drive_backup_settings for insert
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update drive backup settings" on public.drive_backup_settings;
drop policy if exists "Superusers can update drive backup settings" on public.drive_backup_settings;
create policy "Superusers can update drive backup settings"
  on public.drive_backup_settings for update
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());
