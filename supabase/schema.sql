grant usage on schema public to anon, authenticated, service_role;

create table if not exists public.meeting_requests (
  id uuid primary key,
  administrator_id text not null,
  administrator_name text not null,
  administrator_role text,
  administrator_email text not null,
  recurring_slot_id text,
  slot_date date not null,
  slot_start time not null,
  slot_end time not null,
  teacher_name text not null,
  teacher_email text not null,
  topic text not null,
  notes text,
  decline_note text,
  cancel_note text,
  releases_slot boolean,
  status text not null default 'requested',
  invite_status text not null default 'Calendar invite ready to send',
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_settings (
  id text primary key,
  default_approval_email text not null default 'mconniry@wvcs.org',
  meeting_sender_email text,
  form_approval_recipients text[] not null default array['mconniry@wvcs.org'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.meeting_requests enable row level security;
alter table public.notification_settings enable row level security;

drop policy if exists "Authenticated users can read meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can create meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can update meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can read notification settings" on public.notification_settings;

drop policy if exists "Users can read meeting requests" on public.meeting_requests;
create policy "Users can read meeting requests"
  on public.meeting_requests for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create meeting requests" on public.meeting_requests;
create policy "Users can create meeting requests"
  on public.meeting_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update meeting requests" on public.meeting_requests;
create policy "Users can update meeting requests"
  on public.meeting_requests for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can read notification settings" on public.notification_settings;
create policy "Users can read notification settings"
  on public.notification_settings for select
  to anon, authenticated
  using (true);

create table if not exists public.structured_recess_entries (
  id uuid primary key,
  entry_date date not null,
  student_grade text,
  student_name text not null,
  teacher_name text not null,
  recess_type text not null,
  duration text not null,
  needs_structured_recess boolean not null default true,
  needs_work_time boolean not null default false,
  reason text,
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

create index if not exists structured_recess_entries_student_grade_idx
  on public.structured_recess_entries (student_grade);

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

create table if not exists public.form_templates (
  id text primary key,
  title text not null,
  category text,
  description text,
  pdf_name text,
  approver text,
  recipients text[] not null default '{}',
  final_copy_recipients text[] not null default '{}',
  active boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_templates_active_idx
  on public.form_templates (active);

alter table public.form_templates enable row level security;

drop policy if exists "Users can read form templates" on public.form_templates;
create policy "Users can read form templates"
  on public.form_templates for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create form templates" on public.form_templates;
create policy "Users can create form templates"
  on public.form_templates for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update form templates" on public.form_templates;
create policy "Users can update form templates"
  on public.form_templates for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete form templates" on public.form_templates;
create policy "Users can delete form templates"
  on public.form_templates for delete
  to anon, authenticated
  using (true);

create table if not exists public.form_submissions (
  id text primary key,
  template_id text not null,
  template_title text not null,
  submitter_name text not null,
  submitter_email text not null,
  status text not null default 'Submitted',
  reviewer text,
  reviewed_at timestamptz,
  review_notes text,
  email_status text,
  emailed_at timestamptz,
  generated_pdf_name text,
  generated_pdf_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  approval_signature jsonb,
  submission jsonb not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_submissions_status_idx
  on public.form_submissions (status);

create index if not exists form_submissions_submitter_email_idx
  on public.form_submissions (submitter_email);

create index if not exists form_submissions_submitted_at_idx
  on public.form_submissions (submitted_at desc);

alter table public.form_submissions enable row level security;

drop policy if exists "Users can read form submissions" on public.form_submissions;
create policy "Users can read form submissions"
  on public.form_submissions for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create form submissions" on public.form_submissions;
create policy "Users can create form submissions"
  on public.form_submissions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update form submissions" on public.form_submissions;
create policy "Users can update form submissions"
  on public.form_submissions for update
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.staff_access (
  email text primary key,
  can_use_hub boolean not null default true,
  can_use_admin boolean not null default false,
  can_use_scheduler boolean not null default false,
  can_use_digital_slips boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_access (email, can_use_hub, can_use_admin, can_use_scheduler, can_use_digital_slips)
values
  ('mconniry@wvcs.org', true, true, true, true),
  ('bkeith@wvcs.org', true, true, true, true),
  ('jshackelton@wvcs.org', true, true, true, true),
  ('ccota@wvcs.org', true, true, true, true)
on conflict (email) do update
set
  can_use_hub = excluded.can_use_hub,
  can_use_admin = excluded.can_use_admin,
  can_use_scheduler = excluded.can_use_scheduler,
  can_use_digital_slips = excluded.can_use_digital_slips,
  updated_at = now();

alter table public.staff_access enable row level security;

create or replace function public.current_user_can_manage_staff_access()
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
      and can_use_admin = true
  );
$$;

grant execute on function public.current_user_can_manage_staff_access() to authenticated;

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

drop policy if exists "Authenticated users can read staff access" on public.staff_access;
create policy "Authenticated users can read staff access"
  on public.staff_access for select
  to authenticated
  using (
    email = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can create staff access" on public.staff_access;
create policy "Admins can create staff access"
  on public.staff_access for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update staff access" on public.staff_access;
create policy "Admins can update staff access"
  on public.staff_access for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete staff access" on public.staff_access;
create policy "Admins can delete staff access"
  on public.staff_access for delete
  to authenticated
  using (
    email <> 'mconniry@wvcs.org'
    and public.current_user_can_manage_staff_access()
  );

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
  display_order integer not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists important_documents_display_order_idx
  on public.important_documents (display_order asc, uploaded_at desc);

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

drop policy if exists "Users can delete structured recess entries" on public.structured_recess_entries;
create policy "Users can delete structured recess entries"
  on public.structured_recess_entries for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

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

drop policy if exists "Users can read form templates" on public.form_templates;
create policy "Users can read form templates"
  on public.form_templates for select
  to authenticated
  using (true);

drop policy if exists "Users can create form templates" on public.form_templates;
create policy "Users can create form templates"
  on public.form_templates for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Users can update form templates" on public.form_templates;
create policy "Users can update form templates"
  on public.form_templates for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Users can delete form templates" on public.form_templates;
create policy "Users can delete form templates"
  on public.form_templates for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Users can read form submissions" on public.form_submissions;
create policy "Users can read form submissions"
  on public.form_submissions for select
  to authenticated
  using (
    lower(submitter_email) = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_staff_access()
  );

drop policy if exists "Users can create form submissions" on public.form_submissions;
create policy "Users can create form submissions"
  on public.form_submissions for insert
  to authenticated
  with check (
    lower(submitter_email) = lower(auth.jwt() ->> 'email')
    or public.current_user_can_manage_staff_access()
  );

drop policy if exists "Users can update form submissions" on public.form_submissions;
create policy "Users can update form submissions"
  on public.form_submissions for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Users can read form upload files" on storage.objects;
create policy "Users can read form upload files"
  on storage.objects for select
  to authenticated
  using (bucket_id in ('form-uploads', 'form-pdfs'));

drop policy if exists "Users can upload form files" on storage.objects;
create policy "Users can upload form files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('form-uploads', 'form-pdfs'));

drop policy if exists "Users can update form files" on storage.objects;
create policy "Users can update form files"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('form-uploads', 'form-pdfs'))
  with check (bucket_id in ('form-uploads', 'form-pdfs'));

drop policy if exists "Admins can delete form files" on storage.objects;
create policy "Admins can delete form files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('form-uploads', 'form-pdfs')
    and public.current_user_can_manage_staff_access()
  );

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

create table if not exists public.staff_suggestions (
  id uuid primary key,
  title text not null,
  category text not null default 'General',
  body text not null,
  submitter_email text,
  anonymous boolean not null default false,
  status text not null default 'new',
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_suggestions_created_at_idx
  on public.staff_suggestions (created_at desc);

create index if not exists staff_suggestions_status_idx
  on public.staff_suggestions (status);

alter table public.staff_suggestions enable row level security;

drop policy if exists "Authenticated users can read staff suggestions" on public.staff_suggestions;
create policy "Authenticated users can read staff suggestions"
  on public.staff_suggestions for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create staff suggestions" on public.staff_suggestions;
create policy "Authenticated users can create staff suggestions"
  on public.staff_suggestions for insert
  to authenticated
  with check (
    lower(submitter_email) = lower(auth.jwt() ->> 'email')
    or submitter_email is null
    or public.current_user_can_manage_staff_access()
  );

drop policy if exists "Admins can update staff suggestions" on public.staff_suggestions;
create policy "Admins can update staff suggestions"
  on public.staff_suggestions for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can delete staff suggestions" on public.staff_suggestions;
create policy "Admins can delete staff suggestions"
  on public.staff_suggestions for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
