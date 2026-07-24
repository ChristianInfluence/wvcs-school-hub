create table if not exists public.office_finance_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by_email text,
  updated_at timestamptz not null default now()
);

alter table public.office_finance_settings enable row level security;

drop policy if exists "Office finance can read office finance settings" on public.office_finance_settings;
create policy "Office finance can read office finance settings"
  on public.office_finance_settings for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can create office finance settings" on public.office_finance_settings;
create policy "Office finance can create office finance settings"
  on public.office_finance_settings for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can update office finance settings" on public.office_finance_settings;
create policy "Office finance can update office finance settings"
  on public.office_finance_settings for update
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

create or replace function public.touch_office_finance_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_office_finance_settings_updated_at on public.office_finance_settings;
create trigger touch_office_finance_settings_updated_at
  before update on public.office_finance_settings
  for each row
  execute function public.touch_office_finance_settings_updated_at();

insert into public.office_finance_settings (id, settings)
values (
  'family_portal',
  '{
    "announcement": {
      "enabled": false,
      "title": "Family Portal Announcement",
      "message": ""
    },
    "help": {
      "email": "office@wvcs.org",
      "phone": "503-393-5236",
      "message": "For help accessing your family portal, please contact the WVCS office."
    }
  }'::jsonb
)
on conflict (id) do nothing;

grant select, insert, update on public.office_finance_settings to authenticated;
