alter table public.tuition_invoices
  add column if not exists family_key text,
  add column if not exists student_ids text[] not null default '{}',
  add column if not exists payment_status text not null default 'Unpaid',
  add column if not exists paid_at timestamptz,
  add column if not exists payment_history jsonb not null default '[]'::jsonb,
  add column if not exists payment_method text,
  add column if not exists check_number text;

alter table public.tuition_invoices
  drop constraint if exists tuition_invoices_payment_status_check;

alter table public.tuition_invoices
  add constraint tuition_invoices_payment_status_check
  check (payment_status in ('Unpaid', 'Partially Paid', 'Paid'));

create index if not exists tuition_invoices_family_key_idx
  on public.tuition_invoices (family_key);

create index if not exists tuition_invoices_payment_status_idx
  on public.tuition_invoices (payment_status);
