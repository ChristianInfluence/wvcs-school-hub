drop function if exists public.list_hub_message_recipients();

create or replace function public.list_hub_message_recipients()
returns table(email text, name text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    staff_access.email,
    coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'display_name', ''),
      staff_access.email
    ) as name
  from public.staff_access
  left join auth.users auth_user
    on lower(auth_user.email) = lower(staff_access.email)
  where staff_access.can_use_hub = true
  order by name, staff_access.email;
$$;

grant execute on function public.list_hub_message_recipients() to authenticated;
