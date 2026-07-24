alter table public.incidental_invoices
  add column if not exists receipt_number text unique,
  add column if not exists payment_history jsonb not null default '[]'::jsonb,
  add column if not exists void_note text,
  add column if not exists refund_note text;

create sequence if not exists public.incidental_receipt_number_seq;

create or replace function public.assign_incidental_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'Paid' and nullif(new.receipt_number, '') is null then
    new.receipt_number := 'WVCS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.incidental_receipt_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists assign_incidental_receipt_number on public.incidental_invoices;
create trigger assign_incidental_receipt_number
  before insert or update on public.incidental_invoices
  for each row
  execute function public.assign_incidental_receipt_number();
