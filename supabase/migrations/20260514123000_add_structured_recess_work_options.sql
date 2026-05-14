alter table public.structured_recess_entries
  add column if not exists student_grade text,
  add column if not exists needs_structured_recess boolean not null default true,
  add column if not exists needs_work_time boolean not null default false;

create index if not exists structured_recess_entries_student_grade_idx
  on public.structured_recess_entries (student_grade);
