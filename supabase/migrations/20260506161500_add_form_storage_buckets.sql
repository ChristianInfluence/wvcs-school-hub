insert into storage.buckets (id, name, public)
values
  ('form-uploads', 'form-uploads', false),
  ('form-pdfs', 'form-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "Users can read form uploads" on storage.objects;
create policy "Users can read form uploads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('form-uploads', 'form-pdfs'));

drop policy if exists "Users can create form uploads" on storage.objects;
create policy "Users can create form uploads"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id in ('form-uploads', 'form-pdfs'));

drop policy if exists "Users can update form uploads" on storage.objects;
create policy "Users can update form uploads"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id in ('form-uploads', 'form-pdfs'))
  with check (bucket_id in ('form-uploads', 'form-pdfs'));
