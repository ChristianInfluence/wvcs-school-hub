create table if not exists public.hub_message_threads (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  created_by_email text not null,
  latest_post_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_message_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.hub_message_threads(id) on delete cascade,
  email text not null,
  role text not null default 'recipient',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(thread_id, email)
);

create table if not exists public.hub_message_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.hub_message_threads(id) on delete cascade,
  sender_email text not null,
  sender_name text,
  body text not null,
  source text not null default 'hub',
  created_at timestamptz not null default now()
);

create index if not exists hub_message_threads_latest_post_at_idx
  on public.hub_message_threads (latest_post_at desc);

create index if not exists hub_message_participants_email_idx
  on public.hub_message_participants (lower(email));

create index if not exists hub_message_participants_thread_id_idx
  on public.hub_message_participants (thread_id);

create index if not exists hub_message_posts_thread_id_created_at_idx
  on public.hub_message_posts (thread_id, created_at);

create or replace function public.current_user_can_use_hub()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_access
    where email = lower(auth.jwt() ->> 'email')
      and can_use_hub = true
  );
$$;

grant execute on function public.current_user_can_use_hub() to authenticated;

create or replace function public.current_user_created_hub_thread(p_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.hub_message_threads
    where id = p_thread_id
      and lower(created_by_email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.current_user_created_hub_thread(uuid) to authenticated;

create or replace function public.current_user_participates_in_hub_thread(p_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.hub_message_participants
    where hub_message_participants.thread_id = p_thread_id
      and lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.current_user_participates_in_hub_thread(uuid) to authenticated;

create or replace function public.list_hub_message_recipients()
returns table(email text, name text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    staff_access.email,
    coalesce(
      nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'display_name', ''),
      staff_access.email
    ) as name
  from public.staff_access
  left join auth.users auth_user
    on lower(auth_user.email) = lower(staff_access.email)
  where staff_access.can_use_hub = true
  order by name, staff_access.email;
$$;

grant execute on function public.list_hub_message_recipients() to authenticated;

create or replace function public.touch_hub_message_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hub_message_threads
  set latest_post_at = new.created_at,
      updated_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists hub_message_posts_touch_thread on public.hub_message_posts;
create trigger hub_message_posts_touch_thread
after insert on public.hub_message_posts
for each row
execute function public.touch_hub_message_thread();

alter table public.hub_message_threads enable row level security;
alter table public.hub_message_participants enable row level security;
alter table public.hub_message_posts enable row level security;

drop policy if exists "Participants can read hub message threads" on public.hub_message_threads;
create policy "Participants can read hub message threads"
  on public.hub_message_threads for select
  to authenticated
  using (
    public.current_user_can_use_hub()
    and public.current_user_participates_in_hub_thread(id)
  );

drop policy if exists "Hub users can create message threads" on public.hub_message_threads;
create policy "Hub users can create message threads"
  on public.hub_message_threads for insert
  to authenticated
  with check (
    public.current_user_can_use_hub()
    and lower(created_by_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "Participants can read hub message participants" on public.hub_message_participants;
create policy "Participants can read hub message participants"
  on public.hub_message_participants for select
  to authenticated
  using (
    public.current_user_can_use_hub()
    and public.current_user_participates_in_hub_thread(thread_id)
  );

drop policy if exists "Thread creators can add message participants" on public.hub_message_participants;
create policy "Thread creators can add message participants"
  on public.hub_message_participants for insert
  to authenticated
  with check (
    public.current_user_can_use_hub()
    and public.current_user_created_hub_thread(thread_id)
  );

drop policy if exists "Participants can update their read state" on public.hub_message_participants;
create policy "Participants can update their read state"
  on public.hub_message_participants for update
  to authenticated
  using (
    public.current_user_can_use_hub()
    and lower(email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    public.current_user_can_use_hub()
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "Participants can read hub message posts" on public.hub_message_posts;
create policy "Participants can read hub message posts"
  on public.hub_message_posts for select
  to authenticated
  using (
    public.current_user_can_use_hub()
    and public.current_user_participates_in_hub_thread(thread_id)
  );

drop policy if exists "Participants can create hub message posts" on public.hub_message_posts;
create policy "Participants can create hub message posts"
  on public.hub_message_posts for insert
  to authenticated
  with check (
    public.current_user_can_use_hub()
    and lower(sender_email) = lower(auth.jwt() ->> 'email')
    and public.current_user_participates_in_hub_thread(thread_id)
  );
