create table if not exists public.off_campus_lunch_permissions (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null,
  school_year text not null default '2026-2027',
  student_id text not null,
  student_name text not null,
  student_grade text,
  parent_email text not null,
  status text not null default 'Pending',
  permission jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text,
  expires_at timestamptz,
  office_note text,
  updated_at timestamptz not null default now(),
  constraint off_campus_lunch_permissions_status_check
    check (status in ('Pending', 'Approved', 'Denied', 'Needs Correction', 'Revoked', 'Expired'))
);

create index if not exists off_campus_lunch_permissions_family_idx
  on public.off_campus_lunch_permissions (family_key, submitted_at desc);

create index if not exists off_campus_lunch_permissions_student_idx
  on public.off_campus_lunch_permissions (student_id, status);

create index if not exists off_campus_lunch_permissions_status_idx
  on public.off_campus_lunch_permissions (status, expires_at);

alter table public.off_campus_lunch_permissions enable row level security;

drop policy if exists "Office finance can read off campus lunch permissions" on public.off_campus_lunch_permissions;
create policy "Office finance can read off campus lunch permissions"
  on public.off_campus_lunch_permissions for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

drop policy if exists "Office finance can update off campus lunch permissions" on public.off_campus_lunch_permissions;
create policy "Office finance can update off campus lunch permissions"
  on public.off_campus_lunch_permissions for update
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access())
  with check (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

grant select, update on public.off_campus_lunch_permissions to authenticated;
grant select, insert, update on public.off_campus_lunch_permissions to service_role;
