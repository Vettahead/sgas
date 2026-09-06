-- ─────────────────────────────────────────────────────────────────────────────
-- Promotion, by course RUN rather than by day.
--
-- One session per run, dated from the first day to the last, and every day of
-- the run points at it. A delegate holds one booking, so with a session per day
-- they could only ever sit on one of them and the rest of the course looked
-- empty. 755 course events become 529 courses.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_promote_run()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb; v_sessions int; v_hols int; v_engs int; v_booked int; v_dropped int; v_kept int;
begin
  -- The centre being shut is one fact about one day. Teamup records it once per
  -- shared calendar, so keep the first of each.
  create temporary table _closure_kept on commit drop as
    select distinct on (e.start_dt::date, coalesce(e.end_dt::date, e.start_dt::date)) e.event_id
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'closed' and e.start_dt is not null
     order by e.start_dt::date, coalesce(e.end_dt::date, e.start_dt::date), e.event_id;

  -- ── 0. anything that has changed its mind since last time ─────────────────
  -- Only rows this import created are ever removed, and a session somebody is
  -- booked onto is never removed: the booking wins and the event is flagged.
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
     where s.teamup_event_id = e.event_id and s.from_teamup
       and (e.class_kind <> 'course' or e.run_anchor is distinct from e.event_id)
       and not exists (select 1 from booking b where b.session_id = s.session_id)
     returning 1
  ) select (select count(*) from gone) + (select count(*) from gone2)
         + (select count(*) from gone3) into v_dropped;

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

  -- ── 1. each RUN of days becomes one session ───────────────────────────────
  with run as (
    select e.run_anchor,
           min(e.class_course_id)          as course_id,
           min(e.start_dt::date)            as ds,
           max(coalesce(e.end_dt::date, e.start_dt::date)) as de,
           -- whoever is named across the run; the anchor's day wins a tie
           min(e.class_trainer_id)  filter (where e.class_trainer_id  is not null) as trainer_id,
           min(e.class_assessor_id) filter (where e.class_assessor_id is not null) as assessor_id
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'course'
       and e.class_course_id is not null and e.start_dt is not null
       and e.run_anchor is not null
     group by e.run_anchor
  ),
  ins as (
    insert into session (course_id, start_date, end_date, trainer_id, assessor_id, teamup_event_id, from_teamup)
    select course_id, ds, greatest(de, ds), trainer_id, assessor_id, run_anchor, true from run
    on conflict (teamup_event_id) where teamup_event_id is not null do update
      set course_id = excluded.course_id, start_date = excluded.start_date, end_date = excluded.end_date,
          trainer_id = excluded.trainer_id, assessor_id = excluded.assessor_id
    returning session_id, teamup_event_id
  )
  -- every day of the run points at the one session
  update teamup_event e set session_id = i.session_id, brought_across_at = now()
    from ins i where e.run_anchor = i.teamup_event_id;
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
  with who as (
    select e.event_id, e.start_dt::date ds, coalesce(e.end_dt::date, e.start_dt::date) de,
           case when e.class_kind = 'closed' then null else e.class_staff_id end as staff_id,
           case when e.class_kind = 'closed' then 'Centre closed — ' || coalesce(nullif(btrim(e.title),''),'bank holiday')
                else coalesce(nullif(btrim(e.title),''), 'From Teamup') end as title,
           case when e.class_kind = 'closed' then 'closed'
                when e.class_on_site then 'on_site'
                when e.class_kind = 'engagement' then 'meeting'
                else coalesce(e.class_where, 'other') end as kind,
           case when e.class_half in ('am','pm') then e.class_half end as half
      from teamup_event e
     where not e.gone_from_teamup and e.start_dt is not null
       and (e.class_kind in ('whereabouts','engagement')
            or (e.class_kind = 'closed' and e.event_id in (select event_id from _closure_kept)))
  ),
  ins as (
    insert into engagement (title, start_date, end_date, kind, half, teamup_event_id)
    select left(title, 200), ds, greatest(de, ds), kind, half, event_id from who
    on conflict (teamup_event_id) where teamup_event_id is not null do update
      set title = excluded.title, start_date = excluded.start_date,
          end_date = excluded.end_date, kind = excluded.kind, half = excluded.half
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

  update teamup_event e set brought_across_at = null
   where e.brought_across_at is not null
     and e.session_id is null and e.holiday_id is null and e.engagement_id is null;

  -- ── 4. put the delegates on the course ────────────────────────────────────
  -- Through the event's own session, so a delegate named on day 3 of a run
  -- lands on the course rather than on day 3. A person sits a course once, so
  -- where the same person arrives twice take the booking nearest the day.
  with pick as (
    select distinct on (te.session_id, b.client_id) b.booking_id, te.session_id
      from teamup_event_delegate l
      join teamup_event te on te.event_id = l.event_id
      join booking b on b.booking_id = l.booking_id
     where te.session_id is not null
       and l.confidence = 'certain' and not l.name_shared and b.session_id is null
     order by te.session_id, b.client_id, abs(coalesce(l.day_gap, 999))
  )
  update booking b set session_id = p.session_id
    from pick p
   where b.booking_id = p.booking_id
     and not exists (select 1 from booking x
                      where x.session_id = p.session_id and x.client_id = b.client_id);
  get diagnostics v_booked = row_count;

  select jsonb_build_object(
    'course_days',  (select count(*) from teamup_event where not gone_from_teamup and class_kind='course'),
    'courses',      (select count(*) from session where from_teamup),
    'holidays',     (select count(*) from holiday where teamup_event_id is not null),
    'engagements',  v_engs,
    'days_the_centre_was_shut', (select count(*) from engagement where teamup_event_id is not null and kind='closed'),
    'delegates_placed_on_a_course', v_booked,
    'courses_with_people', (select count(distinct session_id) from booking where session_id is not null),
    'sessions_with_a_trainer',  (select count(*) from session where from_teamup and trainer_id is not null),
    'sessions_with_an_assessor',(select count(*) from session where from_teamup and assessor_id is not null),
    'withdrawn_because_reclassified', v_dropped,
    'kept_because_somebody_was_booked_on', v_kept,
    'not_brought_across_we_cannot_read_them',
       (select count(*) from teamup_event where not gone_from_teamup and class_kind='unknown'),
    'still_needing_a_look', (select count(*) from teamup_event where not gone_from_teamup and class_review)
  ) into v_out;
  return v_out;
end;
$function$;
