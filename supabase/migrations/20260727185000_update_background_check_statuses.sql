update public.parent_background_checks
set status = 'Approved'
where status = 'Verified';

update public.parent_background_checks
set status = 'Pending'
where status = 'Expired';

alter table public.parent_background_checks
  alter column status set default 'Pending';

alter table public.parent_background_checks
  drop constraint if exists parent_background_checks_status_check;

alter table public.parent_background_checks
  add constraint parent_background_checks_status_check
  check (status in ('Approved', 'Denied', 'Pending', 'Revoked'));
