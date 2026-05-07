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
