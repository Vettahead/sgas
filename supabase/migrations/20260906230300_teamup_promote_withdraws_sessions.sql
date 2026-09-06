-- ─────────────────────────────────────────────────────────────────────────────
-- Promotion withdraws stale sessions too.
--
-- The vocabulary now knows that "KR - Holidays", "SG HOL" and "Simon Hol" are
-- time off, not courses. Seven events had already been promoted as sessions
-- under the old reading, and promotion had no way to take them back: it
-- withdrew stale holidays and engagements but never sessions.
--
-- A session that somebody has been booked onto is NOT withdrawn. If the
-- classification and a real booking disagree, the booking wins and the event is
-- flagged for a look instead — deleting a course somebody sat is not a
-- decision an import gets to make on its own.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_promote_run()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb; v_sessions int; v_hols int; v_engs int; v_booked int; v_dropped int; v_kept int;
begin
  -- The centre being shut is one fact about one day. Teamup records it once per
  -- shared calendar, so 36 events cover 17 days. Keep the first of each.
  create temporary table _closure_kept on commit drop as
    select distinct on (e.start_dt::date, coalesce(e.end_dt::date, e.start_dt::date)) e.event_id
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'closed' and e.start_dt is not null
     order by e.start_dt::date, coalesce(e.end_dt::date, e.start_dt::date), e.event_id;

  -- ── 0. anything that has changed its mind since last time ─────────────────
  -- A bank holiday that used to be filed as somebody's leave should stop being
  -- somebody's leave. Only rows this import created are ever removed, and a
  -- session with a delegate on it is never removed at all.
  with gone as (
    delete from holiday h using teamup_event e
     where h.teamup_event_id = e.event_id and e.class_kind <> 'holiday' returning 1
  ), gone2 as (
    delete from engagement g using teamup_event e
     where g.teamup_event_id = e.event_id
       and (e.class_kind not in ('whereabouts','engagement','closed')
            or (e.class_kind = 'closed' and e.event_id not in (select event_id from _closure_kept)))
     returning 1
  ), gone3 as (
    delete from session s using teamup_event e
     where s.teamup_event_id = e.event_id and s.from_teamup and e.class_kind <> 'course'
       and not exists (select 1 from booking b where b.session_id = s.session_id)
     returning 1
  ) select (select count(*) from gone) + (select count(*) from gone2)
         + (select count(*) from gone3) into v_dropped;

  -- A course somebody actually sat, now reading as something else. The booking
  -- wins; somebody needs to look at it.
  update teamup_event e set class_review = true
    from session s
   where s.teamup_event_id = e.event_id and s.from_teamup and e.class_kind <> 'course'
     and exists (select 1 from booking b where b.session_id = s.session_id);
  get diagnostics v_kept = row_count;

  update teamup_event e set session_id = null
   where e.session_id is not null and not exists (select 1 from session s where s.session_id = e.session_id);
  update teamup_event e set holiday_id = null
   where e.holiday_id is not null and not exists (select 1 from holiday h where h.holiday_id = e.holiday_id);
  update teamup_event e set engagement_id = null
   where e.engagement_id is not null and not exists (select 1 from engagement g where g.engagement_id = e.engagement_id);
  update teamup_event e set brought_across_at = null
   where e.brought_across_at is not null
     and e.session_id is null and e.holiday_id is null and e.engagement_id is null;

  -- ── 1. courses become sessions ────────────────────────────────────────────
  with src as (
    select e.event_id, e.class_course_id, e.start_dt::date ds,
           coalesce(e.end_dt::date, e.start_dt::date) de,
           e.class_trainer_id, e.class_assessor_id
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'course'
       and e.class_course_id is not null and e.start_dt is not null
  ),
  ins as (
    insert into session (course_id, start_date, end_date, trainer_id, assessor_id, teamup_event_id, from_teamup)
    select class_course_id, ds, greatest(de, ds), class_trainer_id, class_assessor_id, event_id, true
      from src
    on conflict (teamup_event_id) where teamup_event_id is not null do update
      set course_id = excluded.course_id, start_date = excluded.start_date, end_date = excluded.end_date,
          trainer_id = excluded.trainer_id, assessor_id = excluded.assessor_id
    returning session_id, teamup_event_id
  )
  update teamup_event e set session_id = i.session_id, brought_across_at = now()
    from ins i where i.teamup_event_id = e.event_id;
  get diagnostics v_sessions = row_count;

  -- ── 2. time off becomes holidays ──────────────────────────────────────────
  -- Imported as already APPROVED: they happened. Asking somebody to approve
  -- last March retrospectively would be theatre.
  with who as (
    select e.event_id, e.start_dt::date ds, coalesce(e.end_dt::date, e.start_dt::date) de,
           e.class_staff_id as staff_id,
           coalesce(nullif(btrim(e.title),''), 'Time off') as note
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'holiday'
       and e.start_dt is not null and e.class_staff_id is not null
  ),
  ins as (
    insert into holiday (staff_id, start_date, end_date, note, status, teamup_event_id)
    select staff_id, ds, greatest(de, ds), left(note, 200), 'APPROVED', event_id from who
    on conflict (teamup_event_id) where teamup_event_id is not null do update
      set staff_id = excluded.staff_id, start_date = excluded.start_date,
          end_date = excluded.end_date, note = excluded.note
    returning holiday_id, teamup_event_id
  )
  update teamup_event e set holiday_id = i.holiday_id, brought_across_at = now()
    from ins i where i.teamup_event_id = e.event_id;
  get diagnostics v_hols = row_count;

  -- ── 3. everything else becomes an engagement ──────────────────────────────
  -- Whereabouts (office, working from home, audit prep), meetings, on site, and
  -- the days the centre is shut. The person goes on as a MEMBER, because the
  -- question is about a member of staff and the owner is a login. A closed day
  -- has no member: it is nobody's and everybody's.
  with who as (
    select e.event_id, e.start_dt::date ds, coalesce(e.end_dt::date, e.start_dt::date) de,
           case when e.class_kind = 'closed' then null else e.class_staff_id end as staff_id,
           case when e.class_kind = 'closed' then 'Centre closed — ' || coalesce(nullif(btrim(e.title),''),'bank holiday')
                else coalesce(nullif(btrim(e.title),''), 'From Teamup') end as title,
           case when e.class_kind = 'closed' then 'closed'
                when e.class_on_site then 'on_site'
                when e.class_kind = 'engagement' then 'meeting'
                else coalesce(e.class_where, 'other') end as kind
      from teamup_event e
     where not e.gone_from_teamup and e.start_dt is not null
       and (e.class_kind in ('whereabouts','engagement')
            or (e.class_kind = 'closed' and e.event_id in (select event_id from _closure_kept)))
  ),
  ins as (
    insert into engagement (title, start_date, end_date, kind, teamup_event_id)
    select left(title, 200), ds, greatest(de, ds), kind, event_id from who
    on conflict (teamup_event_id) where teamup_event_id is not null do update
      set title = excluded.title, start_date = excluded.start_date,
          end_date = excluded.end_date, kind = excluded.kind
    returning engagement_id, teamup_event_id
  ),
  back as (
    update teamup_event e set engagement_id = i.engagement_id, brought_across_at = now()
      from ins i where i.teamup_event_id = e.event_id
    returning e.engagement_id, e.event_id
  )
  insert into engagement_member (engagement_id, staff_id)
  select b.engagement_id, w.staff_id from back b join who w on w.event_id = b.event_id
   where w.staff_id is not null
  on conflict do nothing;
  select count(*) into v_engs from engagement where teamup_event_id is not null;

  -- ── 4. put the delegates on the sessions ──────────────────────────────────
  -- Only 'certain' links — name, date AND the exact qualification agreed. A
  -- booking already sitting on a session is left alone: something deliberate
  -- beats something derived.
  update booking b
     set session_id = s.session_id
    from teamup_event_delegate l
    join session s on s.teamup_event_id = l.event_id
   where b.booking_id = l.booking_id
     and l.confidence = 'certain' and not l.name_shared
     and b.session_id is null;
  get diagnostics v_booked = row_count;

  select jsonb_build_object(
    'sessions',    (select count(*) from session where from_teamup),
    'holidays',    (select count(*) from holiday where teamup_event_id is not null),
    'engagements', v_engs,
    'days_the_centre_was_shut', (select count(*) from engagement where teamup_event_id is not null and kind='closed'),
    'delegates_placed_on_a_course', v_booked,
    'sessions_with_a_trainer',  (select count(*) from session where from_teamup and trainer_id is not null),
    'sessions_with_an_assessor',(select count(*) from session where from_teamup and assessor_id is not null),
    'withdrawn_because_reclassified', v_dropped,
    'kept_because_somebody_was_booked_on', v_kept,
    'still_needing_a_look', (select count(*) from teamup_event where not gone_from_teamup and class_review)
  ) into v_out;
  return v_out;
end;
$function$;

-- The words the calendar actually uses for time off. "hols" was there; "hol",
-- "holidays" and "leave" were not, so "SG HOL" and "KR - Holidays" were being
-- read as courses.
insert into public.teamup_title_hint (pattern, means, where_kind) values
  ('hol','holiday',null), ('holidays','holiday',null), ('leave','holiday',null),
  ('day off','holiday',null), ('a/l','holiday',null)
on conflict (pattern) do nothing;
