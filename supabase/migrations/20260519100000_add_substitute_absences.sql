create table if not exists public.substitute_absences (
  id text primary key,
  staff_name text not null,
  absence_date date not null,
  periods integer[] not null default '{}',
  notes text,
  coverage jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists substitute_absences_absence_date_idx
  on public.substitute_absences (absence_date);

grant select, insert, update, delete
  on public.substitute_absences
  to authenticated;

grant select, insert, update, delete
  on public.substitute_absences
  to service_role;

alter table public.substitute_absences
  enable row level security;

drop policy if exists "authenticated users can manage substitute absences" on public.substitute_absences;

create policy "authenticated users can manage substitute absences"
  on public.substitute_absences
  for all
  to authenticated
  using (true)
  with check (true);
