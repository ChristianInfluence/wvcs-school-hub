create table if not exists public.form_calendar_events (
  id text primary key,
  submission_id text not null references public.form_submissions(id) on delete cascade,
  template_id text,
  template_title text not null default '',
  submitter_name text not null default '',
  submitter_email text not null default '',
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  description text,
  status text not null default 'Active',
  event jsonb not null default '{}'::jsonb,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_calendar_events_status_check check (status in ('Active', 'Cancelled'))
);

create index if not exists form_calendar_events_submission_id_idx
  on public.form_calendar_events (submission_id);

create index if not exists form_calendar_events_start_at_idx
  on public.form_calendar_events (start_at);

alter table public.form_calendar_events enable row level security;

drop policy if exists "Form managers can read form calendar events" on public.form_calendar_events;
create policy "Form managers can read form calendar events"
  on public.form_calendar_events for select
  to authenticated
  using (public.current_user_can_manage_staff_access());

drop policy if exists "Form managers can create form calendar events" on public.form_calendar_events;
create policy "Form managers can create form calendar events"
  on public.form_calendar_events for insert
  to authenticated
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Form managers can update form calendar events" on public.form_calendar_events;
create policy "Form managers can update form calendar events"
  on public.form_calendar_events for update
  to authenticated
  using (public.current_user_can_manage_staff_access())
  with check (public.current_user_can_manage_staff_access());

drop policy if exists "Form managers can delete form calendar events" on public.form_calendar_events;
create policy "Form managers can delete form calendar events"
  on public.form_calendar_events for delete
  to authenticated
  using (public.current_user_can_manage_staff_access());

grant select, insert, update, delete on public.form_calendar_events to authenticated;
