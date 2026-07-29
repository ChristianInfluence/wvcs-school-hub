alter table public.drive_backup_jobs
  drop constraint if exists drive_backup_jobs_source_check;

alter table public.drive_backup_jobs
  add constraint drive_backup_jobs_source_check
  check (source_type in (
    'permission_submission',
    'form_submission',
    'tuition_invoice',
    'incidental_invoice',
    'incidental_receipt',
    'volunteer_driver_application',
    'student_driver_registration',
    'off_campus_lunch_permission'
  ));
