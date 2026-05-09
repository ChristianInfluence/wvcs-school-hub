create or replace function public.current_user_can_use_hub()
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
  );
$$;

grant execute on function public.current_user_can_use_hub() to authenticated;

drop policy if exists "Users can read structured recess entries" on public.structured_recess_entries;
create policy "Users can read structured recess entries"
  on public.structured_recess_entries for select
  to authenticated
  using (public.current_user_can_use_hub());

drop policy if exists "Users can create structured recess entries" on public.structured_recess_entries;
create policy "Users can create structured recess entries"
  on public.structured_recess_entries for insert
  to authenticated
  with check (public.current_user_can_use_hub());

drop policy if exists "Users can update structured recess entries" on public.structured_recess_entries;
create policy "Users can update structured recess entries"
  on public.structured_recess_entries for update
  to authenticated
  using (public.current_user_can_use_hub())
  with check (public.current_user_can_use_hub());

drop policy if exists "Users can read recess attendance records" on public.recess_attendance_records;
create policy "Users can read recess attendance records"
  on public.recess_attendance_records for select
  to authenticated
  using (public.current_user_can_use_hub());

drop policy if exists "Users can create recess attendance records" on public.recess_attendance_records;
create policy "Users can create recess attendance records"
  on public.recess_attendance_records for insert
  to authenticated
  with check (public.current_user_can_use_hub());

drop policy if exists "Users can update recess attendance records" on public.recess_attendance_records;
create policy "Users can update recess attendance records"
  on public.recess_attendance_records for update
  to authenticated
  using (public.current_user_can_use_hub())
  with check (public.current_user_can_use_hub());
