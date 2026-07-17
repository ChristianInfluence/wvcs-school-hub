create table if not exists public.hub_message_email_imports (
  gmail_message_id text primary key,
  thread_id uuid references public.hub_message_threads(id) on delete set null,
  imported_post_id uuid references public.hub_message_posts(id) on delete set null,
  sender_email text,
  imported_at timestamptz not null default now()
);

create index if not exists hub_message_email_imports_thread_id_idx
  on public.hub_message_email_imports (thread_id);

alter table public.hub_message_email_imports enable row level security;

drop policy if exists "Admins can read hub message email imports" on public.hub_message_email_imports;
create policy "Admins can read hub message email imports"
  on public.hub_message_email_imports for select
  to authenticated
  using (public.current_user_can_manage_staff_access());
