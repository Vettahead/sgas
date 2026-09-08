-- ⛔ THE TEAMUP ARCHIVE WAS UNREADABLE FROM THE APP.
--
-- teamup_event, teamup_note_line and teamup_subcalendar had RLS ON with ZERO
-- policies and no SELECT grant to `authenticated`. Every read from the browser
-- therefore came back empty — silently — and three features that looked
-- finished were doing nothing at all:
--   * the Teamup flip drew an empty overlay ("flipping it changes nothing"),
--   * "built from N Teamup entries" never appeared on a merged course,
--   * and neither did the named-but-not-booked marking.
--
-- They had only ever been checked as `postgres`, over SQL, which is not who the
-- app is. CHECK A READ AS THE APP USER, not as the owner.
--
-- SELECT ONLY, deliberately. These tables are a copy of somebody else's
-- calendar and the point of keeping them is that they are a record: the pull
-- writes them as service_role from the edge function, and the browser reads and
-- never writes. No insert, no update, no delete policy exists or should.
grant select on public.teamup_event       to authenticated;
grant select on public.teamup_note_line   to authenticated;
grant select on public.teamup_subcalendar to authenticated;

drop policy if exists p_signed_in_read on public.teamup_event;
create policy p_signed_in_read on public.teamup_event
  for select to authenticated using (app_is_signed_in());

drop policy if exists p_signed_in_read on public.teamup_note_line;
create policy p_signed_in_read on public.teamup_note_line
  for select to authenticated using (app_is_signed_in());

drop policy if exists p_signed_in_read on public.teamup_subcalendar;
create policy p_signed_in_read on public.teamup_subcalendar
  for select to authenticated using (app_is_signed_in());
