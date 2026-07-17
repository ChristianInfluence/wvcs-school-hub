drop policy if exists "Meeting managers can delete meeting requests" on public.meeting_requests;
create policy "Meeting managers can delete meeting requests"
  on public.meeting_requests for delete
  to authenticated
  using (public.current_user_can_manage_meetings());
