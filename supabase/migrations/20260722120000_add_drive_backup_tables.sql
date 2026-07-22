create table if not exists public.drive_backup_settings (
  id text primary key default 'primary' check (id = 'primary'),
  enabled boolean not null default false,
  provider text not null default 'google_drive',
  root_folder_id text,
  root_folder_name text not null default 'WVCS Hub Backups',
  service_account_email text,
  folder_strategy jsonb not null default '{
    "permissionSlips": ["Digital Permission Slips", "{schoolYear}", "{eventTitle}", "Signed PDFs"],
    "forms": ["Forms", "{templateTitle}", "{schoolYear}", "{status}"]
  }'::jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by_email text
);

create table if not exists public.drive_backup_jobs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  status text not null default 'pending',
  target_folder_path text[] not null default '{}',
  drive_folder_id text,
  drive_file_id text,
  drive_web_url text,
  filename text not null default '',
  error_message text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drive_backup_jobs_status_check check (status in ('pending', 'uploaded', 'failed', 'skipped')),
  constraint drive_backup_jobs_source_check check (source_type in ('permission_submission', 'form_submission'))
);

create unique index if not exists drive_backup_jobs_unique_source_file
  on public.drive_backup_jobs (source_type, source_id, filename);

alter table public.drive_backup_settings enable row level security;
alter table public.drive_backup_jobs enable row level security;

drop policy if exists "Admins can read drive backup settings" on public.drive_backup_settings;
create policy "Admins can read drive backup settings"
  on public.drive_backup_settings for select
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can create drive backup settings" on public.drive_backup_settings;
create policy "Admins can create drive backup settings"
  on public.drive_backup_settings for insert
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can update drive backup settings" on public.drive_backup_settings;
create policy "Admins can update drive backup settings"
  on public.drive_backup_settings for update
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Admins can read drive backup jobs" on public.drive_backup_jobs;
create policy "Admins can read drive backup jobs"
  on public.drive_backup_jobs for select
  using (public.current_user_can_manage_staff_access() or public.current_user_can_use_digital_slips());

drop policy if exists "Staff can create drive backup jobs" on public.drive_backup_jobs;
create policy "Staff can create drive backup jobs"
  on public.drive_backup_jobs for insert
  with check (public.current_user_can_manage_staff_access() or public.current_user_can_use_digital_slips());

drop policy if exists "Staff can update drive backup jobs" on public.drive_backup_jobs;
create policy "Staff can update drive backup jobs"
  on public.drive_backup_jobs for update
  using (public.current_user_can_manage_staff_access() or public.current_user_can_use_digital_slips())
  with check (public.current_user_can_manage_staff_access() or public.current_user_can_use_digital_slips());

grant select, insert, update on public.drive_backup_settings to authenticated, service_role;
grant select, insert, update on public.drive_backup_jobs to authenticated, service_role;
