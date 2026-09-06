-- ── CLASSIFY EVERY TEAMUP EVENT ─────────────────────────────────────────────
-- Nobody is asked anything. It runs, records WHY in words, and a person
-- corrects what looks wrong afterwards. An event somebody has corrected
-- (class_override) is never touched again.
--
-- Split in two on purpose: the RUNNER has no door on it so a scheduled job can
-- call it, and the admin wrapper is the way in for a person.
create or replace function public.app_teamup_classify_run()
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb; v_assessment_day bigint;
begin
  select course_id into v_assessment_day from course where name = 'Assessment day';

  with ev as (
    select e.event_id,
           -- T&A is looked for in BOTH, because Simon said "we normally put T&A
           -- in the description" and half of them are only there.
           coalesce(e.title,'') || ' ' || regexp_replace(coalesce(e.notes,''), '<[^>]+>', ' ', 'g') as hay,
           coalesce(e.title,'') as t, e.subcalendar_ids, e.parsed
      from teamup_event e
     where not e.gone_from_teamup and not e.class_override
  ),
  -- Longest pattern wins, so "heat pumps" beats "met" and "commercial" beats
  -- "com". Word boundaries, so "com" cannot fire inside "computer".
  hits as (
    select ev.event_id, h.pattern, h.scheme, h.means, h.where_kind,
           row_number() over (partition by ev.event_id, h.means order by length(h.pattern) desc) rk
      from ev join teamup_title_hint h
        on ev.t ~* ('(^|[^a-z0-9])' || regexp_replace(h.pattern,'([.*+?^${}()|\[\]\\-])','\\\1','g') || '([^a-z0-9]|$)')
  ),
  best_course as (select event_id, scheme, pattern from hits where means='course' and rk=1),
  best_stop   as (select event_id, means, where_kind, pattern from hits where means in ('holiday','whereabouts','engagement') and rk=1),
  onsite      as (select distinct event_id from hits where means='on_site'),
  -- When the title says nothing (109 events are titled just "assessments"), the
  -- qualifications listed in Candidates resolve to a scheme through the
  -- catalogue Simon already mapped.
  from_cands as (
    select ev.event_id,
           (select c.scheme from jsonb_array_elements(ev.parsed->'delegates') x,
                   lateral jsonb_array_elements_text(x->'quals') q
              join category c on upper(c.code) = upper(q)
             group by c.scheme order by count(*) desc limit 1) as scheme
      from ev where ev.parsed ? 'delegates'
  ),
  -- The stream only ever says WHO. "Keith Assessments" is the courses Keith
  -- assessed; it says nothing about which course, and never did.
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
  -- The title's own initials beat the stream: "Phil Training" contains events
  -- titled "SG - Assessments", and the title is talking about that day.
  from_title_staff as (
    select ev.event_id, (ev.parsed->'staff_ids'->>0)::bigint as staff_id
      from ev where ev.parsed ? 'staff_ids'
  ),
  calc as (
    select ev.event_id, (ev.hay ~* 't ?[&+] ?a') as ta,
           bs.means as stop_means, bs.where_kind, bs.pattern as stop_pattern,
           bc.scheme as title_scheme, bc.pattern as title_pattern,
           fc.scheme as cand_scheme, (o.event_id is not null) as on_site,
           coalesce(fts.staff_id, st.decided_staff, st.hint_staff) as staff_id,
           coalesce(st.decided_role, st.hint_role) as stream_role
      from ev
      left join best_stop bs on bs.event_id = ev.event_id
      left join best_course bc on bc.event_id = ev.event_id
      left join from_cands fc on fc.event_id = ev.event_id
      left join onsite o on o.event_id = ev.event_id
      left join stream st on st.event_id = ev.event_id
      left join from_title_staff fts on fts.event_id = ev.event_id
  ),
  resolved as (
    select c.*,
           -- A course beats a stop word EXCEPT for holiday: "LCL Audit Prep" on
           -- the Hols calendar is work, but "Hols" itself is time off whatever
           -- else the title mentions.
           case when c.stop_means = 'holiday' then 'holiday'
                when c.title_scheme is not null then 'course'
                when c.stop_means is not null then c.stop_means
                else 'course' end as kind,
           coalesce(c.title_scheme, case when c.stop_means is null then c.cand_scheme end) as scheme,
           case when c.title_scheme is not null then 'title'
                when c.stop_means is null and c.cand_scheme is not null then 'candidates'
                else 'catchall' end as course_from
      from calc c
  )
  update teamup_event e
     set class_kind = r.kind,
         class_where = case when r.kind = 'whereabouts' then coalesce(r.where_kind,'other') end,
         class_on_site = r.on_site,
         class_ta = r.ta,
         class_course_id = case when r.kind = 'course' then coalesce(
             (select co.course_id from course co where co.scheme = r.scheme
               and co.name <> 'Assessment day' limit 1), v_assessment_day) end,
         class_course_from = case when r.kind = 'course' then
             case when r.scheme is null then 'catchall' else r.course_from end end,
         -- T&A means they did BOTH. That is the whole reason a single role
         -- dropdown could never have worked.
         class_assessor_id = case when r.kind='course' and (r.ta or r.stream_role='assessor' or r.stream_role is null)
                                  then r.staff_id end,
         class_trainer_id  = case when r.kind='course' and (r.ta or r.stream_role='trainer')
                                  then r.staff_id end,
         class_review = (r.kind='course' and r.scheme is null),
         class_why = case
             when r.kind in ('holiday','whereabouts','engagement') then 'the word "' || r.stop_pattern || '"'
             when r.title_scheme is not null then 'the title says "' || r.title_pattern || '"'
             when r.cand_scheme is not null then 'the qualifications listed in Candidates'
             else 'nothing in the title or Candidates said which course' end
             || case when r.ta then ' · T&A, so trained and assessed' else '' end
             || case when r.on_site then ' · on site at a customer' else '' end,
         classified_at = now()
    from resolved r where r.event_id = e.event_id;

  select jsonb_build_object(
    'events', count(*),
    'by_kind', (select jsonb_object_agg(coalesce(class_kind,'(none)'), n)
                  from (select class_kind, count(*) n from teamup_event where not gone_from_teamup group by 1) x),
    'needing_a_look', count(*) filter (where class_review),
    'on_site', count(*) filter (where class_on_site),
    'trained_and_assessed', count(*) filter (where class_ta),
    'with_a_person', count(*) filter (where class_assessor_id is not null or class_trainer_id is not null)
  ) into v_out from teamup_event where not gone_from_teamup;
  return v_out;
end;
$$;

-- ── WHEN A SCHEME HAS MORE THAN ONE COURSE ──────────────────────────────────
-- ACS Domestic has two: Initial and Reassessment. Knowing the scheme does not
-- tell you which, and the first pass took whichever row came back first — which
-- put 159 events on "Reassessment" for no reason at all. Exactly the sort of
-- invented fact this import has spent all day avoiding.
--
-- The evidence is the R and I markers Simon writes beside each delegate in the
-- Candidates field. All re-sitting -> Reassessment. All new -> Initial. Mixed,
-- or nothing written -> neither is true, so "Assessment day", which is honest
-- and is what a mixed day actually is.
create or replace function public.app_teamup_pick_scheme_course()
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb; v_assessment_day bigint;
begin
  select course_id into v_assessment_day from course where name = 'Assessment day';

  with multi as (
    select scheme from course where name <> 'Assessment day'
     group by scheme having count(*) > 1
  ),
  ev as (
    select e.event_id, c.scheme,
           count(*) filter (where x->>'kind' = 'reassessment') as re,
           count(*) filter (where x->>'kind' = 'initial') as ini
      from teamup_event e
      join course c on c.course_id = e.class_course_id
      join multi m on m.scheme = c.scheme
      left join lateral jsonb_array_elements(coalesce(e.parsed->'delegates','[]'::jsonb)) x on true
     where not e.gone_from_teamup and not e.class_override and e.class_kind = 'course'
     group by e.event_id, c.scheme
  )
  update teamup_event e
     set class_course_id = case
           when ev.re > 0 and ev.ini = 0 then
             (select course_id from course where scheme = ev.scheme and name ~* 'reassess' limit 1)
           when ev.ini > 0 and ev.re = 0 then
             (select course_id from course where scheme = ev.scheme and name !~* 'reassess'
               and name <> 'Assessment day' limit 1)
           else v_assessment_day end,
         class_why = e.class_why || case
           when ev.re > 0 and ev.ini = 0 then ' · everyone was re-sitting'
           when ev.ini > 0 and ev.re = 0 then ' · everyone was taking it for the first time'
           when ev.re > 0 and ev.ini > 0 then ' · a mix of re-sits and first-timers, so no single course fits'
           else ' · nothing said whether it was an initial or a re-sit' end,
         class_review = case when ev.re > 0 and ev.ini = 0 then e.class_review
                             when ev.ini > 0 and ev.re = 0 then e.class_review
                             else true end
    from ev where ev.event_id = e.event_id;

  select jsonb_build_object(
    'by_course', (select jsonb_object_agg(nm, n) from (
        select coalesce((select name from course c where c.course_id = t.class_course_id),'—') nm, count(*) n
          from teamup_event t where not t.gone_from_teamup and t.class_kind='course' group by 1) z),
    'needing_a_look', count(*) filter (where class_review)
  ) into v_out from teamup_event where not gone_from_teamup;
  return v_out;
end;
$$;

create or replace function public.app_teamup_classify(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  v := app_teamup_classify_run();
  perform app_teamup_pick_scheme_course();
  return v;
end;
$$;

revoke all on function public.app_teamup_classify_run() from public, anon, authenticated;
revoke all on function public.app_teamup_pick_scheme_course() from public, anon, authenticated;
revoke all on function public.app_teamup_classify(text, text) from public, anon, authenticated;
grant execute on function public.app_teamup_classify_run() to service_role;
grant execute on function public.app_teamup_pick_scheme_course() to service_role;
grant execute on function public.app_teamup_classify(text, text) to anon, authenticated;
