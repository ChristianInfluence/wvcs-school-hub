alter table public.permission_recipients
  add column if not exists sms_status text,
  add column if not exists sms_queued_at timestamptz,
  add column if not exists sms_sent_at timestamptz,
  add column if not exists sms_error text,
  add column if not exists twilio_message_sid text;

create index if not exists permission_recipients_sms_status_idx
  on public.permission_recipients (sms_status);
