alter table public.lunch_transactions
  add column if not exists incidental_invoice_id uuid,
  add column if not exists incidental_payment_id text;

create unique index if not exists lunch_transactions_incidental_payment_uidx
  on public.lunch_transactions (incidental_invoice_id, incidental_payment_id)
  where incidental_invoice_id is not null and incidental_payment_id is not null;
