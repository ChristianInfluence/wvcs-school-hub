alter table public.meeting_requests
add column if not exists cancel_note text,
add column if not exists releases_slot boolean;
