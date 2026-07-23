create or replace function public.get_student_directory_basic()
returns table (
  student_id uuid,
  grade text,
  student_first_name text,
  student_last_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    directory.student_id,
    directory.grade,
    directory.student_first_name,
    directory.student_last_name
  from public.student_directory as directory
  where directory.active = true
    and public.current_user_can_use_hub()
  order by
    public.student_directory_grade_sort(directory.grade),
    directory.student_last_name,
    directory.student_first_name;
$$;

grant execute on function public.get_student_directory_basic() to authenticated;
