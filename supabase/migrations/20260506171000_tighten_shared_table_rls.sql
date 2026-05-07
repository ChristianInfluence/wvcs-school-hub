drop policy if exists "Users can read structured recess entries" on public.structured_recess_entries;
create policy "Users can read structured recess entries"
  on public.structured_recess_entries for select
  to authenticated
  using (true);

drop policy if exists "Users can create structured recess entries" on public.structured_recess_entries;
create policy "Users can create structured recess entries"
  on public.structured_recess_entries for insert
  to authenticated
  with check (true);

drop policy if exists "Users can update structured recess entries" on public.structured_recess_entries;
create policy "Users can update structured recess entries"
  on public.structured_recess_entries for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete structured recess entries" on public.structured_recess_entries;
create policy "Users can delete structured recess entries"
  on public.structured_recess_entries for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Users can read recess attendance records" on public.recess_attendance_records;
create policy "Users can read recess attendance records"
  on public.recess_attendance_records for select
  to authenticated
  using (true);

drop policy if exists "Users can create recess attendance records" on public.recess_attendance_records;
create policy "Users can create recess attendance records"
  on public.recess_attendance_records for insert
  to authenticated
  with check (true);

drop policy if exists "Users can update recess attendance records" on public.recess_attendance_records;
create policy "Users can update recess attendance records"
  on public.recess_attendance_records for update
  to authenticated
  using (true)
  with check (true);

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
