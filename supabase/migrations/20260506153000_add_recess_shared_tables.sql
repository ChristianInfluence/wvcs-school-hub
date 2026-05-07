create table if not exists public.structured_recess_entries (
  id uuid primary key,
  entry_date date not null,
  student_name text not null,
  teacher_name text not null,
  recess_type text not null,
  duration text not null,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recess_attendance_records (
  id text primary key,
  attendance_date date not null,
  recess_id text not null,
  slot_id text not null,
  grade text not null,
  student_name text not null,
  status text not null default '',
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists structured_recess_entries_entry_date_idx
  on public.structured_recess_entries (entry_date);

create index if not exists recess_attendance_records_attendance_date_idx
  on public.recess_attendance_records (attendance_date);

alter table public.structured_recess_entries enable row level security;
alter table public.recess_attendance_records enable row level security;

drop policy if exists "Users can read structured recess entries" on public.structured_recess_entries;
create policy "Users can read structured recess entries"
  on public.structured_recess_entries for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create structured recess entries" on public.structured_recess_entries;
create policy "Users can create structured recess entries"
  on public.structured_recess_entries for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update structured recess entries" on public.structured_recess_entries;
create policy "Users can update structured recess entries"
  on public.structured_recess_entries for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete structured recess entries" on public.structured_recess_entries;
create policy "Users can delete structured recess entries"
  on public.structured_recess_entries for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users can read recess attendance records" on public.recess_attendance_records;
create policy "Users can read recess attendance records"
  on public.recess_attendance_records for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can upsert recess attendance records" on public.recess_attendance_records;
create policy "Users can upsert recess attendance records"
  on public.recess_attendance_records for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update recess attendance records" on public.recess_attendance_records;
create policy "Users can update recess attendance records"
  on public.recess_attendance_records for update
  to anon, authenticated
  using (true)
  with check (true);
