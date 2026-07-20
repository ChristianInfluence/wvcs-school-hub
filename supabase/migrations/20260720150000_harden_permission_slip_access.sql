alter table public.permission_roster_students enable row level security;
alter table public.permission_roster_parents enable row level security;
alter table public.permission_events enable row level security;
alter table public.permission_recipients enable row level security;
alter table public.permission_submissions enable row level security;
alter table public.permission_audit_log enable row level security;

drop policy if exists "Users can read permission roster students" on public.permission_roster_students;
drop policy if exists "Users can create permission roster students" on public.permission_roster_students;
drop policy if exists "Users can update permission roster students" on public.permission_roster_students;
drop policy if exists "Users can delete permission roster students" on public.permission_roster_students;
drop policy if exists "Digital slips staff can read permission roster students" on public.permission_roster_students;
drop policy if exists "Digital slips staff can create permission roster students" on public.permission_roster_students;
drop policy if exists "Digital slips staff can update permission roster students" on public.permission_roster_students;
drop policy if exists "Digital slips staff can delete permission roster students" on public.permission_roster_students;

create policy "Digital slips staff can read permission roster students"
  on public.permission_roster_students for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission roster students"
  on public.permission_roster_students for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission roster students"
  on public.permission_roster_students for update
  to authenticated
  using (public.current_user_can_use_digital_slips())
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can delete permission roster students"
  on public.permission_roster_students for delete
  to authenticated
  using (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission roster parents" on public.permission_roster_parents;
drop policy if exists "Users can create permission roster parents" on public.permission_roster_parents;
drop policy if exists "Users can update permission roster parents" on public.permission_roster_parents;
drop policy if exists "Users can delete permission roster parents" on public.permission_roster_parents;
drop policy if exists "Digital slips staff can read permission roster parents" on public.permission_roster_parents;
drop policy if exists "Digital slips staff can create permission roster parents" on public.permission_roster_parents;
drop policy if exists "Digital slips staff can update permission roster parents" on public.permission_roster_parents;
drop policy if exists "Digital slips staff can delete permission roster parents" on public.permission_roster_parents;

create policy "Digital slips staff can read permission roster parents"
  on public.permission_roster_parents for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission roster parents"
  on public.permission_roster_parents for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission roster parents"
  on public.permission_roster_parents for update
  to authenticated
  using (public.current_user_can_use_digital_slips())
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can delete permission roster parents"
  on public.permission_roster_parents for delete
  to authenticated
  using (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission events" on public.permission_events;
drop policy if exists "Users can create permission events" on public.permission_events;
drop policy if exists "Users can update permission events" on public.permission_events;
drop policy if exists "Users can delete permission events" on public.permission_events;
drop policy if exists "Digital slips staff can read permission events" on public.permission_events;
drop policy if exists "Digital slips staff can create permission events" on public.permission_events;
drop policy if exists "Digital slips staff can update permission events" on public.permission_events;
drop policy if exists "Digital slips staff can delete permission events" on public.permission_events;

create policy "Digital slips staff can read permission events"
  on public.permission_events for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission events"
  on public.permission_events for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission events"
  on public.permission_events for update
  to authenticated
  using (public.current_user_can_use_digital_slips())
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can delete permission events"
  on public.permission_events for delete
  to authenticated
  using (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission recipients" on public.permission_recipients;
drop policy if exists "Users can create permission recipients" on public.permission_recipients;
drop policy if exists "Users can update permission recipients" on public.permission_recipients;
drop policy if exists "Users can delete permission recipients" on public.permission_recipients;
drop policy if exists "Digital slips staff can read permission recipients" on public.permission_recipients;
drop policy if exists "Digital slips staff can create permission recipients" on public.permission_recipients;
drop policy if exists "Digital slips staff can update permission recipients" on public.permission_recipients;
drop policy if exists "Digital slips staff can delete permission recipients" on public.permission_recipients;

create policy "Digital slips staff can read permission recipients"
  on public.permission_recipients for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission recipients"
  on public.permission_recipients for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission recipients"
  on public.permission_recipients for update
  to authenticated
  using (public.current_user_can_use_digital_slips())
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can delete permission recipients"
  on public.permission_recipients for delete
  to authenticated
  using (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission submissions" on public.permission_submissions;
drop policy if exists "Users can create permission submissions" on public.permission_submissions;
drop policy if exists "Users can update permission submissions" on public.permission_submissions;
drop policy if exists "Digital slips staff can read permission submissions" on public.permission_submissions;
drop policy if exists "Digital slips staff can create permission submissions" on public.permission_submissions;
drop policy if exists "Digital slips staff can update permission submissions" on public.permission_submissions;

create policy "Digital slips staff can read permission submissions"
  on public.permission_submissions for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission submissions"
  on public.permission_submissions for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission submissions"
  on public.permission_submissions for update
  to authenticated
  using (public.current_user_can_use_digital_slips())
  with check (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission audit log" on public.permission_audit_log;
drop policy if exists "Users can create permission audit log" on public.permission_audit_log;
drop policy if exists "Digital slips staff can read permission audit log" on public.permission_audit_log;
drop policy if exists "Digital slips staff can create permission audit log" on public.permission_audit_log;

create policy "Digital slips staff can read permission audit log"
  on public.permission_audit_log for select
  to authenticated
  using (public.current_user_can_use_digital_slips());

create policy "Digital slips staff can create permission audit log"
  on public.permission_audit_log for insert
  to authenticated
  with check (public.current_user_can_use_digital_slips());

drop policy if exists "Users can read permission slip PDFs" on storage.objects;
drop policy if exists "Users can upload permission slip PDFs" on storage.objects;
drop policy if exists "Users can update permission slip PDFs" on storage.objects;
drop policy if exists "Digital slips staff can read permission slip PDFs" on storage.objects;
drop policy if exists "Digital slips staff can upload permission slip PDFs" on storage.objects;
drop policy if exists "Digital slips staff can update permission slip PDFs" on storage.objects;
drop policy if exists "Digital slips staff can delete permission slip PDFs" on storage.objects;

create policy "Digital slips staff can read permission slip PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'permission-slip-pdfs' and public.current_user_can_use_digital_slips());

create policy "Digital slips staff can upload permission slip PDFs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'permission-slip-pdfs' and public.current_user_can_use_digital_slips());

create policy "Digital slips staff can update permission slip PDFs"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'permission-slip-pdfs' and public.current_user_can_use_digital_slips())
  with check (bucket_id = 'permission-slip-pdfs' and public.current_user_can_use_digital_slips());

create policy "Digital slips staff can delete permission slip PDFs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'permission-slip-pdfs' and public.current_user_can_use_digital_slips());
