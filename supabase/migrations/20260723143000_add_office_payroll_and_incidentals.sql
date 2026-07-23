alter table public.staff_access
  add column if not exists can_use_office_payroll boolean not null default false;

update public.staff_access
set can_use_office_payroll = true
where email = 'mconniry@wvcs.org';

create table if not exists public.incidental_invoices (
  id uuid primary key,
  public_token text not null unique,
  family_name text not null default '',
  status text not null default 'Draft',
  payment_status text not null default 'Unpaid',
  invoice_json jsonb not null default '{}'::jsonb,
  payment_url text,
  sent_at timestamptz,
  sent_to text[] not null default '{}',
  paid_at timestamptz,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incidental_invoices_family_idx
  on public.incidental_invoices (lower(family_name));

create index if not exists incidental_invoices_status_idx
  on public.incidental_invoices (status, payment_status);

create index if not exists incidental_invoices_updated_at_idx
  on public.incidental_invoices (updated_at desc);

alter table public.incidental_invoices enable row level security;

drop policy if exists "Office payroll can read incidental invoices" on public.incidental_invoices;
create policy "Office payroll can read incidental invoices"
  on public.incidental_invoices for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
    )
  );

drop policy if exists "Office payroll can create incidental invoices" on public.incidental_invoices;
create policy "Office payroll can create incidental invoices"
  on public.incidental_invoices for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
    )
  );

drop policy if exists "Office payroll can update incidental invoices" on public.incidental_invoices;
create policy "Office payroll can update incidental invoices"
  on public.incidental_invoices for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
    )
  )
  with check (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
    )
  );

drop policy if exists "Office payroll can delete incidental invoices" on public.incidental_invoices;
create policy "Office payroll can delete incidental invoices"
  on public.incidental_invoices for delete
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
    )
  );
