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
