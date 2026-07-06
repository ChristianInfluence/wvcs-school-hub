create table if not exists public.form_approval_actions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  submission_id text not null references public.form_submissions(id) on delete cascade,
  template_id text references public.form_templates(id) on delete set null,
  recipient_email text not null,
  action text not null check (action in ('Approved', 'Rejected')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists form_approval_actions_token_idx
  on public.form_approval_actions (token);

create index if not exists form_approval_actions_submission_id_idx
  on public.form_approval_actions (submission_id);

alter table public.form_approval_actions enable row level security;
