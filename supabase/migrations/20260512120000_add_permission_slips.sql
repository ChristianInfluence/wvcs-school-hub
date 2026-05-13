create table if not exists public.permission_roster_students (
  id text primary key,
  grade text not null,
  student_first_name text,
  student_last_name text,
  student_name text not null,
  student jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_roster_parents (
  id text primary key,
  student_id text not null references public.permission_roster_students(id) on delete cascade,
  parent_order integer not null default 1,
  parent_first_name text,
  parent_last_name text,
  parent_name text,
  parent_email text,
  parent_phone text,
  parent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_events (
  id text primary key,
  title text not null,
  destination text,
  event_date date,
  parent_intro text,
  trip_information text,
  transportation text,
  emergency_instructions text,
  medical_release text,
  fields jsonb not null default '[]'::jsonb,
  selected_grades text[] not null default '{}',
  selected_student_ids text[] not null default '{}',
  status text not null default 'Draft',
  event jsonb not null default '{}'::jsonb,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_recipients (
  id text primary key,
  event_id text not null references public.permission_events(id) on delete cascade,
  student_id text references public.permission_roster_students(id) on delete set null,
  roster_parent_id text references public.permission_roster_parents(id) on delete set null,
  grade text,
  student_name text not null,
  parent_name text,
  parent_email text,
  parent_phone text,
  signing_token text not null unique,
  status text not null default 'Ready',
  delivery_channel text,
  sent_at timestamptz,
  emailed_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  recipient jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_submissions (
  id text primary key,
  event_id text not null references public.permission_events(id) on delete cascade,
  recipient_id text references public.permission_recipients(id) on delete set null,
  student_id text,
  grade text,
  student_name text,
  parent_name text,
  parent_email text,
  signing_token text,
  answers jsonb not null default '{}'::jsonb,
  signer_name text not null,
  signature_data_url text,
  electronic_consent boolean not null default false,
  signed_pdf_bucket text,
  signed_pdf_path text,
  parent_copy_email_status text,
  parent_copy_email_prepared_at timestamptz,
  parent_copy_email_sent_at timestamptz,
  audit jsonb not null default '{}'::jsonb,
  submission jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id text references public.permission_events(id) on delete cascade,
  recipient_id text references public.permission_recipients(id) on delete set null,
  submission_id text references public.permission_submissions(id) on delete set null,
  action text not null,
  actor_email text,
  actor_label text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists permission_roster_students_grade_idx
  on public.permission_roster_students (grade);

create index if not exists permission_roster_parents_student_id_idx
  on public.permission_roster_parents (student_id);

create index if not exists permission_events_event_date_idx
  on public.permission_events (event_date);

create index if not exists permission_events_updated_at_idx
  on public.permission_events (updated_at desc);

create index if not exists permission_recipients_event_id_idx
  on public.permission_recipients (event_id);

create index if not exists permission_recipients_student_id_idx
  on public.permission_recipients (student_id);

create index if not exists permission_recipients_status_idx
  on public.permission_recipients (status);

create index if not exists permission_submissions_event_id_idx
  on public.permission_submissions (event_id);

create index if not exists permission_submissions_student_id_idx
  on public.permission_submissions (student_id);

create index if not exists permission_submissions_signed_at_idx
  on public.permission_submissions (signed_at desc);

create index if not exists permission_audit_log_event_id_idx
  on public.permission_audit_log (event_id);

alter table public.permission_roster_students enable row level security;
alter table public.permission_roster_parents enable row level security;
alter table public.permission_events enable row level security;
alter table public.permission_recipients enable row level security;
alter table public.permission_submissions enable row level security;
alter table public.permission_audit_log enable row level security;

drop policy if exists "Users can read permission roster students" on public.permission_roster_students;
create policy "Users can read permission roster students"
  on public.permission_roster_students for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission roster students" on public.permission_roster_students;
create policy "Users can create permission roster students"
  on public.permission_roster_students for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update permission roster students" on public.permission_roster_students;
create policy "Users can update permission roster students"
  on public.permission_roster_students for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete permission roster students" on public.permission_roster_students;
create policy "Users can delete permission roster students"
  on public.permission_roster_students for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users can read permission roster parents" on public.permission_roster_parents;
create policy "Users can read permission roster parents"
  on public.permission_roster_parents for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission roster parents" on public.permission_roster_parents;
create policy "Users can create permission roster parents"
  on public.permission_roster_parents for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update permission roster parents" on public.permission_roster_parents;
create policy "Users can update permission roster parents"
  on public.permission_roster_parents for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete permission roster parents" on public.permission_roster_parents;
create policy "Users can delete permission roster parents"
  on public.permission_roster_parents for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users can read permission events" on public.permission_events;
create policy "Users can read permission events"
  on public.permission_events for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission events" on public.permission_events;
create policy "Users can create permission events"
  on public.permission_events for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update permission events" on public.permission_events;
create policy "Users can update permission events"
  on public.permission_events for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete permission events" on public.permission_events;
create policy "Users can delete permission events"
  on public.permission_events for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users can read permission recipients" on public.permission_recipients;
create policy "Users can read permission recipients"
  on public.permission_recipients for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission recipients" on public.permission_recipients;
create policy "Users can create permission recipients"
  on public.permission_recipients for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update permission recipients" on public.permission_recipients;
create policy "Users can update permission recipients"
  on public.permission_recipients for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete permission recipients" on public.permission_recipients;
create policy "Users can delete permission recipients"
  on public.permission_recipients for delete
  to anon, authenticated
  using (true);

drop policy if exists "Users can read permission submissions" on public.permission_submissions;
create policy "Users can read permission submissions"
  on public.permission_submissions for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission submissions" on public.permission_submissions;
create policy "Users can create permission submissions"
  on public.permission_submissions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update permission submissions" on public.permission_submissions;
create policy "Users can update permission submissions"
  on public.permission_submissions for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can read permission audit log" on public.permission_audit_log;
create policy "Users can read permission audit log"
  on public.permission_audit_log for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create permission audit log" on public.permission_audit_log;
create policy "Users can create permission audit log"
  on public.permission_audit_log for insert
  to anon, authenticated
  with check (true);

insert into storage.buckets (id, name, public)
values ('permission-slip-pdfs', 'permission-slip-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "Users can read permission slip PDFs" on storage.objects;
create policy "Users can read permission slip PDFs"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'permission-slip-pdfs');

drop policy if exists "Users can upload permission slip PDFs" on storage.objects;
create policy "Users can upload permission slip PDFs"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'permission-slip-pdfs');

drop policy if exists "Users can update permission slip PDFs" on storage.objects;
create policy "Users can update permission slip PDFs"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'permission-slip-pdfs')
  with check (bucket_id = 'permission-slip-pdfs');
