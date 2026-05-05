create table if not exists public.meeting_requests (
  id uuid primary key,
  administrator_id text not null,
  administrator_name text not null,
  administrator_role text,
  administrator_email text not null,
  recurring_slot_id text,
  slot_date date not null,
  slot_start time not null,
  slot_end time not null,
  teacher_name text not null,
  teacher_email text not null,
  topic text not null,
  notes text,
  status text not null default 'requested',
  invite_status text not null default 'Calendar invite ready to send',
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_settings (
  id text primary key,
  default_approval_email text not null default 'mconniry@wvcs.org',
  meeting_sender_email text,
  form_approval_recipients text[] not null default array['mconniry@wvcs.org'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.meeting_requests enable row level security;
alter table public.notification_settings enable row level security;

drop policy if exists "Authenticated users can read meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can create meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can update meeting requests" on public.meeting_requests;
drop policy if exists "Authenticated users can read notification settings" on public.notification_settings;

drop policy if exists "Users can read meeting requests" on public.meeting_requests;
create policy "Users can read meeting requests"
  on public.meeting_requests for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create meeting requests" on public.meeting_requests;
create policy "Users can create meeting requests"
  on public.meeting_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update meeting requests" on public.meeting_requests;
create policy "Users can update meeting requests"
  on public.meeting_requests for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can read notification settings" on public.notification_settings;
create policy "Users can read notification settings"
  on public.notification_settings for select
  to anon, authenticated
  using (true);
