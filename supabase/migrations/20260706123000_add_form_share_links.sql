create table if not exists public.form_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  template_id text not null references public.form_templates(id) on delete cascade,
  created_by_email text,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists form_share_links_token_idx
  on public.form_share_links (token);

create index if not exists form_share_links_template_id_idx
  on public.form_share_links (template_id);

alter table public.form_share_links enable row level security;

