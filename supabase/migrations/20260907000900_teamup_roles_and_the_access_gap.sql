-- ─────────────────────────────────────────────────────────────────────────────
-- Two faults Chris found on one course, 1–2 September 2026.
--
--   "(9) OFTEC SG" on the Tuesday, "(9) DB assist OFTEC & CCN" on the Wednesday.
--   Nine candidates listed and none of them on it, and no trainer and no
--   assessor. "The trainer is his OFTEC SG. So Simon's obviously a trainer, and
--   then DB assist, which is Denis Assessments, so he should be the assessor."
--
-- 1. WHO DID WHAT. Every named person was being called an assessor, and the run
--    then took whichever came first — so Simon was the assessor and Denis was
--    thrown away. A day only states a role when it actually says so: an
--    "X Assessments" calendar, "Phil Training", the word in the title, or T&A
--    meaning both. Otherwise the day names a person and says nothing about what
--    they did, and the RUN settles it: where one person has a definite role and
--    another has none, the other takes the empty slot. Simon trains, Denis
--    assesses, which is how a person reads it.
--
-- 2. THE GAP AFTER THE OLD DATABASE STOPS. The Access extract's last assessment
--    is 27 AUGUST 2026. This course ran on 1 September, so there is no record
--    to link to and never will be — and "book the courses still to come"
--    started from today, leaving 28 August to now orphaned entirely. The
--    boundary is now the honest one: after the day Access stops, Teamup IS the
--    record and its Candidates list is what a booking is built from. Before
--    that day a missing link is a matching problem, and inventing bookings
--    there would make a second copy of assessments Access already holds.
--
-- 3. And a bad match found while checking it: "Jordan Newton" had been booked
--    on as "Jason Newton", because forenames were matched on their first letter
--    alone. A wrong person on a course is worse than a missing one.
-- ─────────────────────────────────────────────────────────────────────────────

-- A shared initial is only enough when the calendar actually wrote an initial.
-- Otherwise the names must match, or one must be the front of the other —
-- Chris/Christopher, Dan/Daniel. Jordan and Jason are neither.
create or replace function public.app_same_forename(p_a text, p_b text)
returns boolean language sql immutable as $$
  select case
    when p_a is null or p_b is null then false
    when upper(p_a) = upper(p_b) then true
    when length(btrim(p_a)) <= 2 or length(btrim(p_b)) <= 2
      then upper(left(btrim(p_a),1)) = upper(left(btrim(p_b),1))
    when length(p_a) >= 3 and upper(p_b) like upper(p_a) || '%' then true
    when length(p_b) >= 3 and upper(p_a) like upper(p_b) || '%' then true
    else false end;
$$;

create or replace function public.app_teamup_settle_roles()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  with cal as (
    select e.event_id, min(s.name) filter (where s.cal_role='person') as person_name
      from teamup_event e
      left join teamup_subcalendar s on s.subcalendar_id = any(e.subcalendar_ids)
     where not e.gone_from_teamup and e.class_kind = 'course'
     group by e.event_id
  )
  update teamup_event e
     set class_role = case
           when e.class_ta then 'both'
           when c.person_name = 'Phil Training'    then 'trainer'
           when c.person_name like '%Assessments'  then 'assessor'
           when e.title ~* '(^|[^a-z])assess'      then 'assessor'
           when e.title ~* '(^|[^a-z])train'       then 'trainer'
           else null end,
         -- the day no longer decides these; the run does
         class_assessor_id = null,
         class_trainer_id  = null
    from cal c where c.event_id = e.event_id;

  select jsonb_build_object(
    'course_days', count(*),
    'days_that_say_assessed', count(*) filter (where class_role='assessor'),
    'days_that_say_trained',  count(*) filter (where class_role='trainer'),
    'days_that_say_both',     count(*) filter (where class_role='both'),
    'days_that_name_a_person_but_not_the_role',
       count(*) filter (where class_role is null and class_staff_id is not null)
  ) into v_out from teamup_event where not gone_from_teamup and class_kind='course';
  return v_out;
end;
$$;

-- Run this after classify and before promote, so the order of authority stays
-- readable: read the calendars, settle initial-or-resit, let "who" name the
-- people, settle what each of them did, then put it on the calendar.
create or replace function public.app_teamup_classify(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v jsonb; w jsonb; u jsonb; r jsonb; g jsonb; x jsonb; b jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  perform app_teamup_read_notes();
  v := app_teamup_classify_run();
  w := app_teamup_pick_scheme_course();
  u := app_teamup_apply_who();
  r := app_teamup_settle_roles();
  g := app_teamup_group_runs();
  perform app_teamup_link_by_sgas();
  perform app_teamup_link_by_name();
  x := app_teamup_promote_run();
  b := app_teamup_book_the_future();
  return v || w || u || r || g || x || b;
end;
$$;
