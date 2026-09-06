-- ─────────────────────────────────────────────────────────────────────────────
-- Domestic Gas ACS is one course.
--
-- Chris: "don't use reassessment, just use Dom Gas ACS — most come as a
-- reassessment when they're mixed courses."
--
-- He is right, and splitting it was a category error. Whether somebody is
-- sitting a qualification for the first time or re-sitting it is a fact about
-- THAT PERSON on THAT DAY, and it already lives where it belongs:
-- booking.is_reassessment for the booking and booking_category.is_reassessment
-- per qualification, both fed by the (R) and (I) markers in the Teamup
-- Candidates list.
--
-- Making it a property of the COURSE forced a single answer onto a room that
-- routinely holds both, and produced the daft situation of "a mix of re-sits
-- and first-timers" being something a person had to come and resolve. There was
-- nothing to resolve — it is one course either way, and the mix is the norm.
--
-- app_teamup_pick_scheme_course() existed only to choose between the two and
-- retires with them. That alone takes 9 events off the list needing a look.
-- ─────────────────────────────────────────────────────────────────────────────

update public.teamup_event set class_course_id = 1 where class_course_id = 2;
update public.teamup_event
   set class_why = regexp_replace(class_why,
         ' · (everyone was re-sitting|everyone was taking it for the first time|a mix of re-sits and first-timers)', '')
 where class_course_id = 1;
update public.session    set course_id = 1 where course_id = 2;
update public.mlp_course set course_id = 1 where course_id = 2;
delete from public.course where course_id = 2;
update public.course set name = 'Domestic Gas ACS' where course_id = 1;

drop function if exists public.app_teamup_pick_scheme_course();

-- One button runs the whole chain, in the order the authority actually flows:
-- read the notes, read the calendars, let "who" name the people, settle what
-- each of them did, join the days into courses, link the delegates by number
-- then by name, put it on the calendar, and book the ones the old database
-- never knew about.
create or replace function public.app_teamup_classify(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v jsonb; u jsonb; r jsonb; g jsonb; x jsonb; b jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  perform app_teamup_read_notes();
  v := app_teamup_classify_run();
  u := app_teamup_apply_who();
  r := app_teamup_settle_roles();
  g := app_teamup_group_runs();
  perform app_teamup_link_by_sgas();
  perform app_teamup_link_by_name();
  x := app_teamup_promote_run();
  b := app_teamup_book_the_future();
  return v || u || r || g || x || b;
end;
$$;
