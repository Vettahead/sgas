-- ─────────────────────────────────────────────────────────────────────────────
-- Classification and promotion, second pass.
--
-- Three changes over 20260906220100:
--
--  * One stop-word per event, not one per kind of stop-word. The first version
--    joined a row per matching kind, so an event whose title said both "hols"
--    and "office" produced two rows and the update picked whichever came out of
--    the plan first. 66 courses were being filed against the wrong reading of
--    their own title because of it.
--  * The person can come from the title (teamup_person_hint), not just from the
--    sub-calendar the event sits on. "Phil Hols" on the shared Hols calendar is
--    Philip Rossall's holiday, and now says so.
--  * "Closed" is a kind of day. The centre being shut is not somebody's leave.
--
-- Promotion writes the back-pointers this time (session_id / holiday_id /
-- engagement_id on teamup_event), withdraws anything that has since been
-- reclassified, and keeps one closure per day rather than one per shared
-- calendar that happened to mention it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_classify_run()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb; v_assessment_day bigint;
begin
  select course_id into v_assessment_day from course where name = 'Assessment day';

  with ev as (
    select e.event_id,
           coalesce(e.title,'') || ' ' || regexp_replace(coalesce(e.notes,''), '<[^>]+>', ' ', 'g') as hay,
           coalesce(e.title,'') as t, e.subcalendar_ids, e.parsed
      from teamup_event e
     where not e.gone_from_teamup and not e.class_override
  ),
  hits as (
    select ev.event_id, h.pattern, h.scheme, h.means, h.where_kind,
           row_number() over (partition by ev.event_id, h.means order by length(h.pattern) desc) rk
      from ev join teamup_title_hint h
        on ev.t ~* ('(^|[^a-z0-9])' || regexp_replace(h.pattern,'([.*+?^${}()|\[\]\\-])','\\\1','g') || '([^a-z0-9]|$)')
  ),
  best_course as (select event_id, scheme, pattern from hits where means='course' and rk=1),
  -- One stop-word per event, not one per kind of stop-word. A title saying both
  -- "hols" and "office" is a holiday; the centre being shut beats everything.
  best_stop as (
    select distinct on (event_id) event_id, means, where_kind, pattern
      from hits
     where means in ('closed','holiday','whereabouts','engagement')
     order by event_id,
              case means when 'closed' then 0 when 'holiday' then 1
                         when 'engagement' then 2 else 3 end,
              length(pattern) desc
  ),
  onsite as (select distinct event_id from hits where means='on_site'),
  from_cands as (
    select ev.event_id,
           (select c.scheme from jsonb_array_elements(ev.parsed->'delegates') x,
                   lateral jsonb_array_elements_text(x->'quals') q
              join category c on upper(c.code) = upper(q)
             group by c.scheme order by count(*) desc limit 1) as scheme
      from ev where ev.parsed ? 'delegates'
  ),
  -- The name in the title. Longest match wins, so "keith rimmer" beats "keith".
  from_hint as (
    select distinct on (ev.event_id) ev.event_id, p.assessor_id
      from ev join teamup_person_hint p
        on ev.t ~* ('(^|[^a-z0-9])' || regexp_replace(p.pattern,'([.*+?^${}()|\[\]\\-])','\\\1','g') || '([^a-z0-9]|$)')
     order by ev.event_id, length(p.pattern) desc
  ),
  stream as (
    select ev.event_id,
           (select s.target_staff_id from teamup_subcalendar s
             where s.subcalendar_id = any(ev.subcalendar_ids) and s.target_staff_id is not null limit 1) as decided_staff,
           (select s.staff_role from teamup_subcalendar s
             where s.subcalendar_id = any(ev.subcalendar_ids) and s.target_staff_id is not null limit 1) as decided_role,
           (select s.proposed_staff from teamup_subcalendar s
             where s.subcalendar_id = any(ev.subcalendar_ids) and s.proposed_staff is not null limit 1) as hint_staff,
           (select s.proposed_role from teamup_subcalendar s
             where s.subcalendar_id = any(ev.subcalendar_ids) and s.proposed_role is not null limit 1) as hint_role
      from ev
  ),
  from_title_staff as (
    select ev.event_id, (ev.parsed->'staff_ids'->>0)::bigint as staff_id
      from ev where ev.parsed ? 'staff_ids'
  ),
  calc as (
    select ev.event_id,
           (ev.hay ~* 't ?[&+] ?a') as ta,
           bs.means as stop_means, bs.where_kind, bs.pattern as stop_pattern,
           bc.scheme as title_scheme, bc.pattern as title_pattern,
           fc.scheme as cand_scheme,
           (o.event_id is not null) as on_site,
           -- The person the pull found, then the name in the title, then whose
           -- calendar it sits on. A named person beats a shared calendar.
           coalesce(fts.staff_id, fh.assessor_id, st.decided_staff, st.hint_staff) as staff_id,
           (fh.assessor_id is not null and fts.staff_id is null) as staff_from_title,
           coalesce(st.decided_role, st.hint_role) as stream_role
      from ev
      left join best_stop bs on bs.event_id = ev.event_id
      left join best_course bc on bc.event_id = ev.event_id
      left join from_cands fc on fc.event_id = ev.event_id
      left join onsite o on o.event_id = ev.event_id
      left join stream st on st.event_id = ev.event_id
      left join from_hint fh on fh.event_id = ev.event_id
      left join from_title_staff fts on fts.event_id = ev.event_id
  ),
  resolved as (
    select c.*,
           case
             when c.stop_means = 'closed'  then 'closed'
             when c.stop_means = 'holiday' then 'holiday'
             when c.title_scheme is not null then 'course'
             when c.stop_means is not null then c.stop_means
             else 'course'
           end as kind,
           coalesce(c.title_scheme, case when c.stop_means is null then c.cand_scheme end) as scheme,
           case when c.title_scheme is not null then 'title'
                when c.stop_means is null and c.cand_scheme is not null then 'candidates'
                else 'catchall' end as course_from
      from calc c
  )
  update teamup_event e
     set class_kind  = r.kind,
         class_where = case when r.kind = 'whereabouts' then coalesce(r.where_kind,'other') end,
         class_on_site = r.on_site,
         class_ta      = r.ta,
         class_staff_id = case when r.kind = 'closed' then null else r.staff_id end,
         class_course_id = case when r.kind = 'course' then coalesce(
             (select co.course_id from course co
               where co.scheme = r.scheme and co.name <> 'Assessment day'
               limit 1),
             v_assessment_day) end,
         class_course_from = case when r.kind = 'course' then
             case when r.scheme is null then 'catchall' else r.course_from end end,
         class_assessor_id = case when r.kind='course' and (r.ta or r.stream_role='assessor' or r.stream_role is null)
                                  then r.staff_id end,
         class_trainer_id  = case when r.kind='course' and (r.ta or r.stream_role='trainer')
                                  then r.staff_id end,
         -- Needs a look if we could not say which course, or if it is somebody's
         -- day and we cannot say whose. A closed centre belongs to nobody.
         class_review = (r.kind='course' and r.scheme is null)
                     or (r.kind in ('holiday','whereabouts','engagement') and r.staff_id is null),
         class_why = case
             when r.kind = 'closed' then 'the word "' || r.stop_pattern || '" — the centre is shut'
             when r.kind in ('holiday','whereabouts','engagement') then 'the word "' || r.stop_pattern || '"'
             when r.title_scheme is not null then 'the title says "' || r.title_pattern || '"'
             when r.cand_scheme is not null then 'the qualifications listed in Candidates'
             else 'nothing in the title or Candidates said which course' end
             || case when r.staff_from_title then ' · the title names the person' else '' end
             || case when r.ta then ' · T&A, so trained and assessed' else '' end
             || case when r.on_site then ' · on site at a customer' else '' end,
         classified_at = now()
    from resolved r where r.event_id = e.event_id;

  select jsonb_build_object(
    'events', count(*),
    'by_kind', (select jsonb_object_agg(coalesce(class_kind,'(none)'), n)
                  from (select class_kind, count(*) n from teamup_event where not gone_from_teamup group by 1) x),
    'course_from', (select jsonb_object_agg(coalesce(class_course_from,'-'), n)
                  from (select class_course_from, count(*) n from teamup_event where not gone_from_teamup and class_kind='course' group by 1) y),
    'needing_a_look', count(*) filter (where class_review),
    'on_site', count(*) filter (where class_on_site),
    'trained_and_assessed', count(*) filter (where class_ta),
    'with_a_person', count(*) filter (where class_staff_id is not null)
  ) into v_out from teamup_event where not gone_from_teamup;
  return v_out;
end;
$function$;


create or replace function public.app_teamup_promote_run()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb; v_sessions int; v_hols int; v_engs int; v_booked int; v_dropped int;
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
  -- somebody's leave. Only rows this import created are ever removed.
  with gone as (
    delete from holiday h using teamup_event e
     where h.teamup_event_id = e.event_id and e.class_kind <> 'holiday' returning 1
  ), gone2 as (
    delete from engagement g using teamup_event e
     where g.teamup_event_id = e.event_id
       and (e.class_kind not in ('whereabouts','engagement','closed')
            or (e.class_kind = 'closed' and e.event_id not in (select event_id from _closure_kept)))
     returning 1
  ) select (select count(*) from gone) + (select count(*) from gone2) into v_dropped;
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
    'still_needing_a_look', (select count(*) from teamup_event where not gone_from_teamup and class_review)
  ) into v_out;
  return v_out;
end;
$function$;
