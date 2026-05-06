alter table public.meeting_requests
add column if not exists decline_note text;
