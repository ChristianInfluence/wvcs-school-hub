create table if not exists public.scheduler_versions (
  id uuid primary key,
  name text not null default 'Untitled Version',
  saved_at timestamptz not null default now(),
  schedule_json jsonb not null default '{}'::jsonb,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduler_versions_saved_at_idx
  on public.scheduler_versions (saved_at desc);

create index if not exists scheduler_versions_name_idx
  on public.scheduler_versions (lower(name));

alter table public.scheduler_versions enable row level security;

drop policy if exists "Schedulers can read scheduler versions" on public.scheduler_versions;
create policy "Schedulers can read scheduler versions"
  on public.scheduler_versions for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_scheduler = true)
    )
  );

drop policy if exists "Schedulers can create scheduler versions" on public.scheduler_versions;
create policy "Schedulers can create scheduler versions"
  on public.scheduler_versions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_scheduler = true)
    )
  );

drop policy if exists "Schedulers can update scheduler versions" on public.scheduler_versions;
create policy "Schedulers can update scheduler versions"
  on public.scheduler_versions for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_scheduler = true)
    )
  )
  with check (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_scheduler = true)
    )
  );

drop policy if exists "Schedulers can delete scheduler versions" on public.scheduler_versions;
create policy "Schedulers can delete scheduler versions"
  on public.scheduler_versions for delete
  to authenticated
  using (
    exists (
      select 1
      from public.staff_access staff
      where staff.email = lower(auth.jwt() ->> 'email')
        and staff.can_use_hub = true
        and (staff.can_use_admin = true or staff.can_use_scheduler = true)
    )
  );
