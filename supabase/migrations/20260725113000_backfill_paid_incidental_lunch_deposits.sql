with paid_lunch_invoices as (
  select
    invoice.id,
    invoice.family_key,
    invoice.family_name,
    coalesce(
      (
        select sum(coalesce(nullif(payment ->> 'amount', '')::numeric, 0))
        from jsonb_array_elements(coalesce(invoice.invoice_json -> 'paymentHistory', '[]'::jsonb)) payment
        where coalesce(payment ->> 'type', 'payment') not in ('refund', 'void')
      ),
      case
        when invoice.payment_status = 'Paid' then (
          select sum(coalesce(nullif(charge ->> 'amount', '')::numeric, 0))
          from jsonb_array_elements(coalesce(invoice.invoice_json -> 'charges', '[]'::jsonb)) charge
        )
        else 0
      end,
      0
    ) as paid_total,
    coalesce(
      (
        select sum(coalesce(nullif(charge ->> 'amount', '')::numeric, 0))
        from jsonb_array_elements(coalesce(invoice.invoice_json -> 'charges', '[]'::jsonb)) charge
        where coalesce(charge ->> 'category', '') = 'Lunch Payment'
           or coalesce(charge ->> 'description', '') = 'Lunch Payment'
      ),
      0
    ) as lunch_total,
    coalesce(
      (
        select sum(coalesce(transaction.amount, 0))
        from public.lunch_transactions transaction
        where transaction.incidental_invoice_id = invoice.id
          and transaction.type = 'deposit'
      ),
      0
    ) as already_credited
  from public.incidental_invoices invoice
  where invoice.payment_status = 'Paid'
    and coalesce(invoice.family_key, '') <> ''
),
deposits_to_insert as (
  select
    id,
    family_key,
    family_name,
    least(paid_total, greatest(lunch_total - already_credited, 0)) as amount
  from paid_lunch_invoices
  where lunch_total > already_credited
    and paid_total > 0
),
inserted as (
  insert into public.lunch_transactions (
    family_key,
    family_name,
    type,
    amount,
    description,
    payment_method,
    incidental_invoice_id,
    incidental_payment_id,
    created_by_email
  )
  select
    family_key,
    family_name,
    'deposit',
    amount,
    'Incidental lunch payment backfill',
    'office',
    id,
    'backfill-lunch-' || id::text,
    'System'
  from deposits_to_insert
  where amount > 0
  on conflict (incidental_invoice_id, incidental_payment_id)
  where incidental_invoice_id is not null and incidental_payment_id is not null
  do nothing
  returning family_key, family_name, amount
),
family_totals as (
  select family_key, max(family_name) as family_name, sum(amount) as amount
  from inserted
  group by family_key
)
insert into public.lunch_accounts (
  family_key,
  family_name,
  balance,
  updated_by_email,
  updated_at
)
select
  family_key,
  family_name,
  amount,
  'System',
  now()
from family_totals
on conflict (family_key) do update
set balance = public.lunch_accounts.balance + excluded.balance,
    family_name = excluded.family_name,
    updated_by_email = 'System',
    updated_at = now();
