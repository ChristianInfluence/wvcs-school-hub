create table if not exists public.staff_payroll_worksheets (
  id uuid primary key default gen_random_uuid(),
  school_year text not null default '2026-2027',
  title text not null default 'WVCS Payroll Worksheet',
  hourly_rate numeric not null default 16.55,
  rows jsonb not null default '[]'::jsonb,
  summary_adjustments jsonb not null default '[]'::jsonb,
  benefits_total numeric not null default 0,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_payroll_worksheets enable row level security;

drop policy if exists "Matthew can manage staff payroll worksheets" on public.staff_payroll_worksheets;
create policy "Matthew can manage staff payroll worksheets"
on public.staff_payroll_worksheets
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org');

grant select, insert, update, delete on public.staff_payroll_worksheets to authenticated;
grant all on public.staff_payroll_worksheets to service_role;

create index if not exists staff_payroll_worksheets_school_year_idx
on public.staff_payroll_worksheets (school_year desc, title asc);
