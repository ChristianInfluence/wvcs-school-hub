create table if not exists public.staff_contracts (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null default '',
  staff_email text not null default '',
  school_year text not null default '2026-2027',
  position_title text not null default 'Teacher',
  contract_start text not null default '',
  contract_end text not null default '',
  board_meeting_date text not null default '',
  fte numeric not null default 1,
  base_salary numeric not null default 32000,
  years_at_wvcs integer not null default 0,
  has_masters boolean not null default false,
  has_state_certification boolean not null default false,
  custom_adjustments jsonb not null default '[]'::jsonb,
  compensation jsonb not null default '{}'::jsonb,
  admin_signature jsonb not null default '{}'::jsonb,
  staff_signature jsonb not null default '{}'::jsonb,
  board_signature jsonb not null default '{}'::jsonb,
  staff_token text not null default encode(gen_random_bytes(24), 'hex'),
  board_token text not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'Draft',
  pdf_backup_queued_at timestamptz,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_contracts_status_check
    check (status in ('Draft', 'Admin Signed', 'Sent to Staff', 'Staff Signed', 'Sent to Board', 'Complete', 'Voided'))
);

create index if not exists staff_contracts_staff_name_idx
  on public.staff_contracts (staff_name, school_year);

create index if not exists staff_contracts_staff_token_idx
  on public.staff_contracts (staff_token);

create index if not exists staff_contracts_board_token_idx
  on public.staff_contracts (board_token);

alter table public.staff_contracts enable row level security;

drop policy if exists "Matthew can read staff contracts" on public.staff_contracts;
create policy "Matthew can read staff contracts"
  on public.staff_contracts for select
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'mconniry@wvcs.org');

drop policy if exists "Matthew can create staff contracts" on public.staff_contracts;
create policy "Matthew can create staff contracts"
  on public.staff_contracts for insert
  to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'mconniry@wvcs.org');

drop policy if exists "Matthew can update staff contracts" on public.staff_contracts;
create policy "Matthew can update staff contracts"
  on public.staff_contracts for update
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'mconniry@wvcs.org')
  with check (lower(auth.jwt() ->> 'email') = 'mconniry@wvcs.org');

grant select, insert, update on public.staff_contracts to authenticated;
grant select, insert, update on public.staff_contracts to service_role;

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
    'off_campus_lunch_permission',
    'staff_contract'
  ));
