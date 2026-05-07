create table if not exists public.staff_access (
  email text primary key,
  can_use_hub boolean not null default true,
  can_use_admin boolean not null default false,
  can_use_scheduler boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_access (email, can_use_hub, can_use_admin, can_use_scheduler)
values
  ('mconniry@wvcs.org', true, true, true),
  ('bkeith@wvcs.org', true, true, true),
  ('jshackelton@wvcs.org', true, true, true),
  ('ccota@wvcs.org', true, true, true)
on conflict (email) do update
set
  can_use_hub = excluded.can_use_hub,
  can_use_admin = excluded.can_use_admin,
  can_use_scheduler = excluded.can_use_scheduler,
  updated_at = now();

alter table public.staff_access enable row level security;

drop policy if exists "Authenticated users can read staff access" on public.staff_access;
create policy "Authenticated users can read staff access"
  on public.staff_access for select
  to authenticated
  using (true);
