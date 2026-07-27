alter table public.drive_backup_jobs
  drop constraint if exists drive_backup_jobs_source_check;

alter table public.drive_backup_jobs
  add constraint drive_backup_jobs_source_check
  check (source_type in (
    'permission_submission',
    'form_submission',
    'tuition_invoice',
    'incidental_invoice',
    'incidental_receipt'
  ));

drop policy if exists "Admins can read drive backup jobs" on public.drive_backup_jobs;
create policy "Admins can read drive backup jobs"
  on public.drive_backup_jobs for select
  using (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_digital_slips()
    or public.current_user_can_use_office_finance()
  );

drop policy if exists "Staff can create drive backup jobs" on public.drive_backup_jobs;
create policy "Staff can create drive backup jobs"
  on public.drive_backup_jobs for insert
  with check (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_digital_slips()
    or public.current_user_can_use_office_finance()
  );

drop policy if exists "Staff can update drive backup jobs" on public.drive_backup_jobs;
create policy "Staff can update drive backup jobs"
  on public.drive_backup_jobs for update
  using (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_digital_slips()
    or public.current_user_can_use_office_finance()
  )
  with check (
    public.current_user_can_manage_staff_access()
    or public.current_user_can_use_digital_slips()
    or public.current_user_can_use_office_finance()
  );
