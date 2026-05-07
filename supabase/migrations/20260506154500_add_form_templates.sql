create table if not exists public.form_templates (
  id text primary key,
  title text not null,
  category text,
  description text,
  pdf_name text,
  approver text,
  recipients text[] not null default '{}',
  final_copy_recipients text[] not null default '{}',
  active boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists form_templates_active_idx
  on public.form_templates (active);

alter table public.form_templates enable row level security;

drop policy if exists "Users can read form templates" on public.form_templates;
create policy "Users can read form templates"
  on public.form_templates for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create form templates" on public.form_templates;
create policy "Users can create form templates"
  on public.form_templates for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Users can update form templates" on public.form_templates;
create policy "Users can update form templates"
  on public.form_templates for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Users can delete form templates" on public.form_templates;
create policy "Users can delete form templates"
  on public.form_templates for delete
  to anon, authenticated
  using (true);
