alter table public.staff_access
  add column if not exists can_use_digital_slips boolean not null default false;

create or replace function public.current_user_can_use_digital_slips()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access
    where email = lower(auth.jwt() ->> 'email')
      and can_use_hub = true
      and (can_use_admin = true or can_use_digital_slips = true)
  );
$$;

grant execute on function public.current_user_can_use_digital_slips() to authenticated;
