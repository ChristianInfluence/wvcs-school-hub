create extension if not exists pgcrypto;

create table if not exists public.family_portal_access (
  id uuid primary key default gen_random_uuid(),
  family_key text not null unique,
  family_name text not null default '',
  contact_emails text[] not null default '{}',
  public_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
  active boolean not null default true,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_portal_access_token_idx
  on public.family_portal_access (public_token);

create table if not exists public.fos_hour_entries (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null default '',
  school_year text not null default '2026-2027',
  parent_name text not null default '',
  parent_email text not null default '',
  activity_date date not null default current_date,
  activity text not null default '',
  notes text not null default '',
  submitted_hours numeric(6,2) not null default 0,
  approved_hours numeric(6,2) not null default 0,
  status text not null default 'Pending',
  office_note text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fos_hour_entries_status_check check (status in ('Pending','Approved','Denied','Adjusted')),
  constraint fos_hour_entries_hours_check check (submitted_hours >= 0 and approved_hours >= 0)
);

create index if not exists fos_hour_entries_family_year_idx
  on public.fos_hour_entries (lower(family_key), school_year, submitted_at desc);

create index if not exists fos_hour_entries_status_idx
  on public.fos_hour_entries (status, submitted_at desc);

alter table public.family_portal_access enable row level security;
alter table public.fos_hour_entries enable row level security;

drop policy if exists "Office finance can read family portal access" on public.family_portal_access;
create policy "Office finance can read family portal access"
  on public.family_portal_access for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can create family portal access" on public.family_portal_access;
create policy "Office finance can create family portal access"
  on public.family_portal_access for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can update family portal access" on public.family_portal_access;
create policy "Office finance can update family portal access"
  on public.family_portal_access for update
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can read FOS entries" on public.fos_hour_entries;
create policy "Office finance can read FOS entries"
  on public.fos_hour_entries for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can create FOS entries" on public.fos_hour_entries;
create policy "Office finance can create FOS entries"
  on public.fos_hour_entries for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can update FOS entries" on public.fos_hour_entries;
create policy "Office finance can update FOS entries"
  on public.fos_hour_entries for update
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

create or replace function public.touch_family_portal_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_family_portal_access_updated_at on public.family_portal_access;
create trigger touch_family_portal_access_updated_at
  before update on public.family_portal_access
  for each row
  execute function public.touch_family_portal_access_updated_at();

create or replace function public.touch_fos_hour_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_fos_hour_entries_updated_at on public.fos_hour_entries;
create trigger touch_fos_hour_entries_updated_at
  before update on public.fos_hour_entries
  for each row
  execute function public.touch_fos_hour_entries_updated_at();

create or replace function public.ensure_family_portal_access(
  target_family_key text,
  target_family_name text,
  target_contact_emails text[] default '{}'
)
returns table (
  family_key text,
  family_name text,
  contact_emails text[],
  public_token text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_can_use_office_finance() then
    raise exception 'Not authorized';
  end if;

  insert into public.family_portal_access (
    family_key,
    family_name,
    contact_emails,
    created_by_email,
    updated_by_email
  )
  values (
    target_family_key,
    target_family_name,
    coalesce(target_contact_emails, '{}'),
    lower(auth.jwt() ->> 'email'),
    lower(auth.jwt() ->> 'email')
  )
  on conflict (family_key) do update
    set family_name = excluded.family_name,
        contact_emails = excluded.contact_emails,
        active = true,
        updated_by_email = lower(auth.jwt() ->> 'email')
  where public.family_portal_access.family_key = excluded.family_key;

  return query
  select
    access.family_key,
    access.family_name,
    access.contact_emails,
    access.public_token
  from public.family_portal_access access
  where access.family_key = target_family_key;
end;
$$;

grant select, insert, update on public.family_portal_access to authenticated;
grant select, insert, update on public.fos_hour_entries to authenticated;
grant execute on function public.ensure_family_portal_access(text, text, text[]) to authenticated;
