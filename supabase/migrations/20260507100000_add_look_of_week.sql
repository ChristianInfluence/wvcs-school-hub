create table if not exists public.look_of_week_issues (
  id uuid primary key,
  title text not null,
  week_of date not null,
  notes text,
  file_name text not null,
  file_type text not null default 'application/pdf',
  file_size bigint not null default 0,
  storage_path text not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists look_of_week_issues_week_of_idx
  on public.look_of_week_issues (week_of desc);

alter table public.look_of_week_issues enable row level security;

drop policy if exists "Authenticated users can read look of week" on public.look_of_week_issues;
create policy "Authenticated users can read look of week"
  on public.look_of_week_issues for select
  to authenticated
  using (true);

drop policy if exists "Admins can create look of week" on public.look_of_week_issues;
create policy "Admins can create look of week"
  on public.look_of_week_issues for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update look of week" on public.look_of_week_issues;
create policy "Admins can update look of week"
  on public.look_of_week_issues for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete look of week" on public.look_of_week_issues;
create policy "Admins can delete look of week"
  on public.look_of_week_issues for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('look-of-the-week', 'look-of-the-week', false, 52428800, array['application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read look of week files" on storage.objects;
create policy "Authenticated users can read look of week files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'look-of-the-week');

drop policy if exists "Admins can upload look of week files" on storage.objects;
create policy "Admins can upload look of week files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'look-of-the-week'
    and public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can update look of week files" on storage.objects;
create policy "Admins can update look of week files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'look-of-the-week'
    and public.current_user_can_manage_staff_access()
  )
  with check (
    bucket_id = 'look-of-the-week'
    and public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can delete look of week files" on storage.objects;
create policy "Admins can delete look of week files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'look-of-the-week'
    and public.current_user_can_manage_staff_access()
  );
