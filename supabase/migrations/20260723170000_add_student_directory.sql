create table if not exists public.student_directory (
  student_id uuid primary key default gen_random_uuid(),
  grade text not null,
  student_first_name text not null,
  student_last_name text not null,
  parent1_first_name text not null default '',
  parent1_last_name text not null default '',
  email1 text not null default '',
  phone1 text not null default '',
  parent2_first_name text not null default '',
  parent2_last_name text not null default '',
  phone2 text not null default '',
  email2 text not null default '',
  active boolean not null default true,
  archived_at timestamptz,
  archive_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_directory_grade_check check (grade in ('PS','PK','K','1','2','3','4','5','6','7','8','9','10','11','12')),
  constraint student_directory_name_check check (length(btrim(student_first_name)) > 0 and length(btrim(student_last_name)) > 0)
);

create index if not exists student_directory_active_grade_name_idx
  on public.student_directory (active, grade, student_last_name, student_first_name);

create or replace function public.student_directory_grade_sort(grade_value text)
returns integer
language sql
immutable
as $$
  select case grade_value
    when 'PS' then 0
    when 'PK' then 1
    when 'K' then 2
    when '1' then 3
    when '2' then 4
    when '3' then 5
    when '4' then 6
    when '5' then 7
    when '6' then 8
    when '7' then 9
    when '8' then 10
    when '9' then 11
    when '10' then 12
    when '11' then 13
    when '12' then 14
    else 999
  end;
$$;

create or replace function public.touch_student_directory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_student_directory_updated_at on public.student_directory;
create trigger touch_student_directory_updated_at
  before update on public.student_directory
  for each row
  execute function public.touch_student_directory_updated_at();

alter table public.student_directory enable row level security;

drop policy if exists "Admins can read student directory" on public.student_directory;
create policy "Admins can read student directory"
  on public.student_directory for select
  to authenticated
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can create student directory" on public.student_directory;
create policy "Admins can create student directory"
  on public.student_directory for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update student directory" on public.student_directory;
create policy "Admins can update student directory"
  on public.student_directory for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete student directory" on public.student_directory;
create policy "Admins can delete student directory"
  on public.student_directory for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

grant select, insert, update, delete on public.student_directory to authenticated;
grant execute on function public.student_directory_grade_sort(text) to authenticated;
