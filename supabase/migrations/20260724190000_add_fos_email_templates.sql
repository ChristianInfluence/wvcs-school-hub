create table if not exists public.fos_email_templates (
  id text primary key,
  subject text not null default '',
  heading text not null default '',
  body text not null default '',
  updated_by_email text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.fos_email_templates (id, subject, heading, body)
values (
  'reminder',
  'WVCS FOS Balance Reminder: {familyName}',
  'FOS Balance Reminder',
  'Hello {familyName},

This is a reminder that your current FOS amount owed is {amountOwed}.

You currently have {approvedHours} approved volunteer hours and {remainingHours} hours remaining.

If you have completed volunteer hours that have not yet been reported, please log into your WVCS Family Portal and submit them for office review.

Family Portal: {portalLoginUrl}'
)
on conflict (id) do nothing;

alter table public.fos_email_templates enable row level security;

drop policy if exists "Office finance can read FOS email templates" on public.fos_email_templates;
create policy "Office finance can read FOS email templates"
  on public.fos_email_templates for select
  to authenticated
  using (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can create FOS email templates" on public.fos_email_templates;
create policy "Office finance can create FOS email templates"
  on public.fos_email_templates for insert
  to authenticated
  with check (public.current_user_can_use_office_finance());

drop policy if exists "Office finance can update FOS email templates" on public.fos_email_templates;
create policy "Office finance can update FOS email templates"
  on public.fos_email_templates for update
  to authenticated
  using (public.current_user_can_use_office_finance())
  with check (public.current_user_can_use_office_finance());

create or replace function public.touch_fos_email_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_fos_email_templates_updated_at on public.fos_email_templates;
create trigger touch_fos_email_templates_updated_at
  before update on public.fos_email_templates
  for each row
  execute function public.touch_fos_email_templates_updated_at();

grant select, insert, update on public.fos_email_templates to authenticated, service_role;
