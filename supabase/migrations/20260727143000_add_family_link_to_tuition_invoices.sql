alter table public.tuition_invoices
  add column if not exists family_key text,
  add column if not exists student_ids text[] not null default '{}';

create index if not exists tuition_invoices_family_key_idx
  on public.tuition_invoices (family_key);

create index if not exists tuition_invoices_student_ids_idx
  on public.tuition_invoices using gin (student_ids);
