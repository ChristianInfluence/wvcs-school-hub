alter table public.family_portal_access
  add column if not exists last_fos_reminder_sent_at timestamptz,
  add column if not exists last_fos_reminder_sent_by_email text;

alter table public.fos_email_templates
  add column if not exists reminder_schedule jsonb not null default '{
    "enabled": false,
    "frequency": "monthly",
    "dayOfMonth": 1,
    "onlyWithBalance": true,
    "skipRecentlyRemindedDays": 14
  }'::jsonb;

create table if not exists public.fos_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  family_key text not null default '',
  family_name text not null default '',
  actor_email text,
  recipient_emails text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fos_audit_events_family_created_idx
  on public.fos_audit_events (lower(family_key), created_at desc);

create index if not exists fos_audit_events_type_created_idx
  on public.fos_audit_events (event_type, created_at desc);

alter table public.fos_audit_events enable row level security;

drop policy if exists "Office finance can read FOS audit events" on public.fos_audit_events;
create policy "Office finance can read FOS audit events"
  on public.fos_audit_events for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can create FOS audit events" on public.fos_audit_events;
create policy "Office finance can create FOS audit events"
  on public.fos_audit_events for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

grant select, insert on public.fos_audit_events to authenticated, service_role;
