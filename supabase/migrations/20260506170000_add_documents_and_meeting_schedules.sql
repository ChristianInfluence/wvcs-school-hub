create or replace function public.current_user_can_manage_meetings()
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
      and (can_use_admin = true or can_use_scheduler = true)
  );
$$;

grant execute on function public.current_user_can_manage_meetings() to authenticated;

create table if not exists public.important_documents (
  id uuid primary key,
  title text not null,
  category text not null default 'General',
  description text,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists important_documents_uploaded_at_idx
  on public.important_documents (uploaded_at desc);

alter table public.important_documents enable row level security;

drop policy if exists "Authenticated users can read important documents" on public.important_documents;
create policy "Authenticated users can read important documents"
  on public.important_documents for select
  to authenticated
  using (true);

drop policy if exists "Admins can create important documents" on public.important_documents;
create policy "Admins can create important documents"
  on public.important_documents for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update important documents" on public.important_documents;
create policy "Admins can update important documents"
  on public.important_documents for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete important documents" on public.important_documents;
create policy "Admins can delete important documents"
  on public.important_documents for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

insert into storage.buckets (id, name, public, file_size_limit)
values ('important-documents', 'important-documents', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "Authenticated users can read important document files" on storage.objects;
create policy "Authenticated users can read important document files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'important-documents');

drop policy if exists "Admins can upload important document files" on storage.objects;
create policy "Admins can upload important document files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'important-documents'
    and public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can update important document files" on storage.objects;
create policy "Admins can update important document files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'important-documents'
    and public.current_user_can_manage_staff_access()
  )
  with check (
    bucket_id = 'important-documents'
    and public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can delete important document files" on storage.objects;
create policy "Admins can delete important document files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'important-documents'
    and public.current_user_can_manage_staff_access()
  );

create table if not exists public.meeting_administrators (
  id text primary key,
  name text not null,
  role text not null,
  email text not null,
  active boolean not null default true,
  booking_url text not null default '',
  recurring_slots jsonb not null default '[]'::jsonb,
  blocked_slots jsonb not null default '[]'::jsonb,
  slots jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.meeting_administrators (id, name, role, email, active, booking_url, recurring_slots, blocked_slots, slots)
values
  (
    'matt-conniry',
    'Matt Conniry',
    'Principal',
    'mconniry@wvcs.org',
    true,
    '',
    '[{"id":"mc-mon-0830","weekday":1,"start":"08:30","end":"09:00","active":true},{"id":"mc-wed-1400","weekday":3,"start":"14:00","end":"14:30","active":true}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  (
    'chris-cota',
    'Chris Cota',
    'Dean of Students',
    'ccota@wvcs.org',
    true,
    '',
    '[{"id":"cc-tue-1015","weekday":2,"start":"10:15","end":"10:45","active":true},{"id":"cc-thu-1315","weekday":4,"start":"13:15","end":"13:45","active":true}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  (
    'lynne-marks',
    'Lynne Marks',
    'Instructional Coach',
    'lmarks@wvcs.org',
    true,
    '',
    '[{"id":"lm-mon-1115","weekday":1,"start":"11:15","end":"11:45","active":true},{"id":"lm-fri-0900","weekday":5,"start":"09:00","end":"09:30","active":true}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  )
on conflict (id) do nothing;

alter table public.meeting_administrators enable row level security;

drop policy if exists "Authenticated users can read meeting administrators" on public.meeting_administrators;
create policy "Authenticated users can read meeting administrators"
  on public.meeting_administrators for select
  to authenticated
  using (true);

drop policy if exists "Meeting managers can create administrators" on public.meeting_administrators;
create policy "Meeting managers can create administrators"
  on public.meeting_administrators for insert
  to authenticated
  with check (public.current_user_can_manage_meetings());

drop policy if exists "Meeting managers can update administrators" on public.meeting_administrators;
create policy "Meeting managers can update administrators"
  on public.meeting_administrators for update
  to authenticated
  using (public.current_user_can_manage_meetings())
  with check (public.current_user_can_manage_meetings());

drop policy if exists "Meeting managers can delete administrators" on public.meeting_administrators;
create policy "Meeting managers can delete administrators"
  on public.meeting_administrators for delete
  to authenticated
  using (public.current_user_can_manage_meetings());

drop policy if exists "Users can read meeting requests" on public.meeting_requests;
create policy "Users can read meeting requests"
  on public.meeting_requests for select
  to authenticated
  using (
    lower(teacher_email) = lower(auth.jwt() ->> 'email')
    or lower(administrator_email) = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_meetings()
  );

drop policy if exists "Users can create meeting requests" on public.meeting_requests;
create policy "Users can create meeting requests"
  on public.meeting_requests for insert
  to authenticated
  with check (
    lower(teacher_email) = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_meetings()
  );

drop policy if exists "Users can update meeting requests" on public.meeting_requests;
create policy "Users can update meeting requests"
  on public.meeting_requests for update
  to authenticated
  using (public.current_user_can_manage_meetings())
  with check (public.current_user_can_manage_meetings());

drop policy if exists "Users can read notification settings" on public.notification_settings;
create policy "Users can read notification settings"
  on public.notification_settings for select
  to authenticated
  using (true);
