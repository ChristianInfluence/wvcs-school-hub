create table if not exists public.curriculum_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  authors jsonb not null default '[]'::jsonb,
  publisher text not null default '',
  edition text not null default '',
  publication_year text not null default '',
  isbn10 text,
  isbn13 text,
  description text not null default '',
  cover_image_url text not null default '',
  material_type text not null default 'Textbook',
  reusable boolean not null default true,
  quantity_on_hand integer not null default 0,
  active boolean not null default true,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_resources_quantity_nonnegative check (quantity_on_hand >= 0),
  constraint curriculum_resources_isbn10_format check (isbn10 is null or isbn10 ~ '^[0-9]{9}[0-9X]$'),
  constraint curriculum_resources_isbn13_format check (isbn13 is null or isbn13 ~ '^[0-9]{13}$')
);

create unique index if not exists curriculum_resources_isbn10_unique
  on public.curriculum_resources (isbn10)
  where isbn10 is not null;

create unique index if not exists curriculum_resources_isbn13_unique
  on public.curriculum_resources (isbn13)
  where isbn13 is not null;

create index if not exists curriculum_resources_title_idx
  on public.curriculum_resources (lower(title), active);

create table if not exists public.curriculum_assignments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.curriculum_resources(id) on delete restrict,
  grade_level text not null,
  subject text not null default '',
  course_name text not null default '',
  teacher_name text not null default '',
  teacher_email text not null default '',
  school_year text not null default '2026-2027',
  notes text not null default '',
  active boolean not null default true,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curriculum_assignments_resource_idx
  on public.curriculum_assignments (resource_id, active);

create index if not exists curriculum_assignments_browse_idx
  on public.curriculum_assignments (school_year, grade_level, subject, teacher_email);

create table if not exists public.curriculum_inventory_submissions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.curriculum_resources(id) on delete restrict,
  assignment_id uuid references public.curriculum_assignments(id) on delete set null,
  submitted_count integer not null,
  previous_quantity integer not null,
  resulting_quantity integer not null,
  school_year text not null default '2026-2027',
  note text not null default '',
  submitted_by_email text not null default '',
  submitted_by_name text not null default '',
  status text not null default 'Submitted',
  created_at timestamptz not null default now(),
  constraint curriculum_inventory_submitted_nonnegative check (submitted_count >= 0),
  constraint curriculum_inventory_previous_nonnegative check (previous_quantity >= 0),
  constraint curriculum_inventory_resulting_nonnegative check (resulting_quantity >= 0),
  constraint curriculum_inventory_status_check check (status in ('Submitted', 'Adjusted', 'Denied', 'Approved'))
);

create index if not exists curriculum_inventory_resource_idx
  on public.curriculum_inventory_submissions (resource_id, created_at desc);

alter table public.curriculum_resources enable row level security;
alter table public.curriculum_assignments enable row level security;
alter table public.curriculum_inventory_submissions enable row level security;

drop policy if exists "Matthew can manage curriculum resources" on public.curriculum_resources;
create policy "Matthew can manage curriculum resources"
on public.curriculum_resources
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org');

drop policy if exists "Matthew can manage curriculum assignments" on public.curriculum_assignments;
create policy "Matthew can manage curriculum assignments"
on public.curriculum_assignments
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org');

drop policy if exists "Matthew can manage curriculum inventory" on public.curriculum_inventory_submissions;
create policy "Matthew can manage curriculum inventory"
on public.curriculum_inventory_submissions
for all
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mconniry@wvcs.org');

grant select, insert, update on public.curriculum_resources to authenticated;
grant select, insert, update on public.curriculum_assignments to authenticated;
grant select, insert on public.curriculum_inventory_submissions to authenticated;
grant all on public.curriculum_resources to service_role;
grant all on public.curriculum_assignments to service_role;
grant all on public.curriculum_inventory_submissions to service_role;

create or replace function public.submit_curriculum_inventory(
  p_resource_id uuid,
  p_assignment_id uuid,
  p_submitted_count integer,
  p_school_year text,
  p_note text,
  p_submitted_by_name text,
  p_submitted_by_email text
)
returns public.curriculum_inventory_submissions
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_count integer;
  inserted_row public.curriculum_inventory_submissions;
begin
  if p_submitted_count is null or p_submitted_count < 0 then
    raise exception 'Inventory count must be a nonnegative whole number.';
  end if;

  select quantity_on_hand
    into previous_count
    from public.curriculum_resources
    where id = p_resource_id
    for update;

  if previous_count is null then
    raise exception 'Curriculum resource not found.';
  end if;

  update public.curriculum_resources
    set quantity_on_hand = p_submitted_count,
        updated_by_email = p_submitted_by_email,
        updated_at = now()
    where id = p_resource_id;

  insert into public.curriculum_inventory_submissions (
    resource_id,
    assignment_id,
    submitted_count,
    previous_quantity,
    resulting_quantity,
    school_year,
    note,
    submitted_by_name,
    submitted_by_email,
    status
  )
  values (
    p_resource_id,
    p_assignment_id,
    p_submitted_count,
    previous_count,
    p_submitted_count,
    coalesce(nullif(trim(p_school_year), ''), '2026-2027'),
    coalesce(p_note, ''),
    coalesce(p_submitted_by_name, ''),
    coalesce(p_submitted_by_email, ''),
    'Submitted'
  )
  returning * into inserted_row;

  return inserted_row;
end;
$$;

grant execute on function public.submit_curriculum_inventory(uuid, uuid, integer, text, text, text, text) to authenticated;
