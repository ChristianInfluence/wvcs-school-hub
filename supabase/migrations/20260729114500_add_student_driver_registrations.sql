create table if not exists public.student_driver_registrations (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null default '',
  school_year text not null default '',
  student_id text not null default '',
  student_name text not null default '',
  student_grade text not null default '',
  parent_email text not null default '',
  status text not null default 'Pending',
  registration jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text,
  expires_at timestamptz,
  office_note text,
  updated_at timestamptz not null default now(),
  constraint student_driver_registrations_status_check
    check (status in ('Pending', 'Approved', 'Denied', 'Needs Correction', 'Revoked', 'Expired'))
);

create index if not exists student_driver_registrations_family_idx
  on public.student_driver_registrations (family_key, submitted_at desc);

create index if not exists student_driver_registrations_student_idx
  on public.student_driver_registrations (student_id, status);

create index if not exists student_driver_registrations_status_idx
  on public.student_driver_registrations (status, expires_at);

alter table public.student_driver_registrations enable row level security;

drop policy if exists "Office finance can read student driver registrations" on public.student_driver_registrations;
create policy "Office finance can read student driver registrations"
  on public.student_driver_registrations for select
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

drop policy if exists "Office finance can update student driver registrations" on public.student_driver_registrations;
create policy "Office finance can update student driver registrations"
  on public.student_driver_registrations for update
  to authenticated
  using (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access())
  with check (public.current_user_can_use_office_finance() or public.current_user_can_manage_staff_access());

grant select, update on public.student_driver_registrations to authenticated;
grant select, insert, update on public.student_driver_registrations to service_role;
