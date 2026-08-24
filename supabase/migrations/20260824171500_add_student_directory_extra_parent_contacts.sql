alter table public.student_directory
  add column if not exists parent1_additional_emails text[] not null default '{}',
  add column if not exists parent1_work_phones text[] not null default '{}',
  add column if not exists parent2_additional_emails text[] not null default '{}',
  add column if not exists parent2_work_phones text[] not null default '{}';
