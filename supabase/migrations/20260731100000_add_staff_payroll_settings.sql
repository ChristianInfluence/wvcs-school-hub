alter table public.staff_payroll_worksheets
add column if not exists settings jsonb not null default '{}'::jsonb;
