create table if not exists public.tuition_invoices (
  id uuid primary key,
  family_name text not null default '',
  school_year text not null default '',
  status text not null default 'Draft',
  invoice_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  sent_to text[] not null default '{}',
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tuition_invoices_year_family_idx
  on public.tuition_invoices (school_year, lower(family_name));

create index if not exists tuition_invoices_status_idx
  on public.tuition_invoices (status);

create index if not exists tuition_invoices_updated_at_idx
  on public.tuition_invoices (updated_at desc);

alter table public.tuition_invoices enable row level security;

drop policy if exists "Admins can read tuition invoices" on public.tuition_invoices;
create policy "Admins can read tuition invoices"
  on public.tuition_invoices for select
  to authenticated
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can create tuition invoices" on public.tuition_invoices;
create policy "Admins can create tuition invoices"
  on public.tuition_invoices for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update tuition invoices" on public.tuition_invoices;
create policy "Admins can update tuition invoices"
  on public.tuition_invoices for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete tuition invoices" on public.tuition_invoices;
create policy "Admins can delete tuition invoices"
  on public.tuition_invoices for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());
