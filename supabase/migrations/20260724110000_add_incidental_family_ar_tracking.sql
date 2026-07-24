alter table public.incidental_invoices
  add column if not exists family_key text,
  add column if not exists student_ids uuid[] not null default '{}',
  add column if not exists paid_in_office boolean not null default false,
  add column if not exists payment_method text,
  add column if not exists check_number text;

create index if not exists incidental_invoices_family_key_idx
  on public.incidental_invoices (lower(family_key));

create index if not exists incidental_invoices_paid_at_idx
  on public.incidental_invoices (paid_at desc);

create or replace function public.current_user_can_use_office_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access staff
    where staff.email = lower(auth.jwt() ->> 'email')
      and staff.can_use_hub = true
      and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
  );
$$;

grant execute on function public.current_user_can_use_office_finance() to authenticated;

create or replace function public.get_office_family_directory()
returns table (
  student_id uuid,
  grade text,
  student_first_name text,
  student_last_name text,
  parent1_first_name text,
  parent1_last_name text,
  email1 text,
  parent2_first_name text,
  parent2_last_name text,
  email2 text,
  family_key text,
  family_name text
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
    directory.student_last_name,
    directory.parent1_first_name,
    directory.parent1_last_name,
    directory.email1,
    directory.parent2_first_name,
    directory.parent2_last_name,
    directory.email2,
    lower(
      regexp_replace(
        concat_ws(
          '|',
          nullif(directory.email1, ''),
          nullif(directory.email2, ''),
          directory.student_last_name
        ),
        '\s+',
        '',
        'g'
      )
    ) as family_key,
    concat(directory.student_last_name, ' Family') as family_name
  from public.student_directory directory
  where directory.active = true
    and public.current_user_can_use_office_finance()
  order by
    directory.student_last_name,
    directory.student_first_name;
$$;

grant execute on function public.get_office_family_directory() to authenticated;
