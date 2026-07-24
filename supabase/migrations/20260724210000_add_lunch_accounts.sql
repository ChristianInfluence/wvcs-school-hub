create table if not exists public.lunch_accounts (
  family_key text primary key,
  family_name text not null default '',
  balance numeric(10,2) not null default 0,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lunch_menus (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  week_start date,
  status text not null default 'Draft',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lunch_orders (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid references public.lunch_menus(id) on delete set null,
  family_key text not null,
  family_name text not null default '',
  student_id uuid,
  student_name text not null default '',
  student_grade text not null default '',
  order_date date not null,
  item_name text not null default '',
  item_description text not null default '',
  price numeric(8,2) not null default 0,
  source text not null default 'Office',
  status text not null default 'Anticipated',
  served_at timestamptz,
  charged_at timestamptz,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lunch_transactions (
  id uuid primary key default gen_random_uuid(),
  family_key text not null,
  family_name text not null default '',
  student_id uuid,
  student_name text not null default '',
  order_id uuid references public.lunch_orders(id) on delete set null,
  type text not null,
  amount numeric(10,2) not null default 0,
  description text not null default '',
  payment_method text,
  check_number text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_processing_fee numeric(10,2),
  stripe_net_amount numeric(10,2),
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists lunch_menus_status_idx on public.lunch_menus (status, week_start desc);
create index if not exists lunch_orders_date_idx on public.lunch_orders (order_date desc, status);
create index if not exists lunch_orders_family_idx on public.lunch_orders (family_key, order_date desc);
create index if not exists lunch_transactions_family_idx on public.lunch_transactions (family_key, created_at desc);

alter table public.lunch_accounts enable row level security;
alter table public.lunch_menus enable row level security;
alter table public.lunch_orders enable row level security;
alter table public.lunch_transactions enable row level security;

create or replace function public.current_user_can_use_office_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access staff
    where staff.email = lower(auth.jwt() ->> 'email')
      and staff.can_use_hub = true
      and (staff.can_use_admin = true or staff.can_use_office_payroll = true)
  );
$$;

grant execute on function public.current_user_can_use_office_finance() to authenticated;

drop policy if exists "Office finance can manage lunch accounts" on public.lunch_accounts;
create policy "Office finance can manage lunch accounts"
  on public.lunch_accounts for all
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can manage lunch menus" on public.lunch_menus;
create policy "Office finance can manage lunch menus"
  on public.lunch_menus for all
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can manage lunch orders" on public.lunch_orders;
create policy "Office finance can manage lunch orders"
  on public.lunch_orders for all
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can manage lunch transactions" on public.lunch_transactions;
create policy "Office finance can manage lunch transactions"
  on public.lunch_transactions for all
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());
