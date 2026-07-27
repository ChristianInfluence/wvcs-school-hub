create table if not exists public.volunteer_driver_applications (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null default '',
  school_year text not null default '',
  parent_name text not null default '',
  parent_email text not null default '',
  status text not null default 'Pending',
  application jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text,
  expires_at timestamptz,
  office_note text,
  updated_at timestamptz not null default now(),
  constraint volunteer_driver_applications_status_check
    check (status in ('Pending', 'Verified', 'Denied', 'Expired'))
);

create index if not exists volunteer_driver_applications_family_idx
  on public.volunteer_driver_applications (family_key, submitted_at desc);

create index if not exists volunteer_driver_applications_status_idx
  on public.volunteer_driver_applications (status, expires_at);

alter table public.volunteer_driver_applications enable row level security;

drop policy if exists "Office finance can read driver applications" on public.volunteer_driver_applications;
create policy "Office finance can read driver applications"
  on public.volunteer_driver_applications for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

drop policy if exists "Office finance can update driver applications" on public.volunteer_driver_applications;
create policy "Office finance can update driver applications"
  on public.volunteer_driver_applications for update
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access())
  with check (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

grant select, update on public.volunteer_driver_applications to authenticated;
grant select, insert, update on public.volunteer_driver_applications to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'volunteer-driver-documents',
  'volunteer-driver-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Office finance can read driver documents" on storage.objects;
create policy "Office finance can read driver documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'volunteer-driver-documents'
    and (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access())
  );
