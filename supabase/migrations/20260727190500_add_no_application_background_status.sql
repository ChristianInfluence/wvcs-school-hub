alter table public.parent_background_checks
  alter column status set default 'No Application';

alter table public.parent_background_checks
  drop constraint if exists parent_background_checks_status_check;

alter table public.parent_background_checks
  add constraint parent_background_checks_status_check
  check (status in ('No Application', 'Approved', 'Denied', 'Pending', 'Revoked'));
