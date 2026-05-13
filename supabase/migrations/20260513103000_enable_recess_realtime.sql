do $$
begin
  alter publication supabase_realtime add table public.recess_attendance_records;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.structured_recess_entries;
exception
  when duplicate_object then null;
end $$;
