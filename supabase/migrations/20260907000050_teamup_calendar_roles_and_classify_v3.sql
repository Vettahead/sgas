-- ─────────────────────────────────────────────────────────────────────────────
-- What each Teamup calendar actually TELLS you, and reading events from the
-- combination rather than from the title alone.
--
-- The first attempt asked "which course is this calendar", and Chris was right
-- that no answer to that exists — the calendars are not split by course. The
-- second attempt over-corrected and ignored the calendars entirely, which is
-- how "DOCTORS 3.15pm" on Hols / Not Available became an assessment day.
--
-- The question that does have an answer is what KIND of calendar each one is.
-- There are four, and an event sits on two or three at once:
--
--   topic   — narrows the course family (Domestic, OFTEC, LPG, F-Gas...)
--   person  — says WHO, and nothing about the course. The course is inside the
--             event and different every time: Keith Assessments, Denis
--             Assessments, Phil Training, Simon, and the four Spares.
--   off     — not a working day. Hols / Not Available.
--   where   — where the day happened. A MODIFIER, not a replacement: BAE ON
--             SITE HWSS is a real HWSS course delivered at a customer, while
--             SG Worcester is a visit with no course in it at all.
--
-- The Spares are not spare. Chris worked them out and the titles confirm it:
-- Spare, Spare1 and Spare2 are Steve Johnston's ("Steve Hols" on Spare2 is what
-- pins it), Spare3 is Simon's.
--
-- And nothing falls through to being a course any more. That single rule is
-- what produced the doctor's appointment. If nothing says course, the answer is
-- "we do not know", it is flagged, and it is not put on the calendar at all.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.teamup_subcalendar
  add column if not exists cal_role   text,
  add column if not exists cal_scheme text,
  add column if not exists cal_staff  bigint references public.assessor(assessor_id) on delete set null,
  add column if not exists cal_where  text,
  add column if not exists cal_note   text;

alter table public.teamup_event
  add column if not exists class_half text,
  add column if not exists class_role text;

insert into public.teamup_person_hint (pattern, assessor_id, note) values
  ('sg', 5, 'Simon Gadsdon — as in SG-OOS. Word boundaries keep it out of SGAS'),
  ('db', 6, 'Denis Brown — as in DB assist'),
  ('pr', 8, 'Philip Rossall')
on conflict (pattern) do nothing;

update public.teamup_subcalendar set cal_role=null, cal_scheme=null, cal_where=null;

update public.teamup_subcalendar set cal_role='topic', cal_scheme=v.scheme, cal_note=v.note
  from (values
    ('Domestic',                                               'ACS Domestic',   null),
    ('Commercial COM x',                                       'ACS Commercial', null),
    ('OFTEC',                                                  'OFTEC',          null),
    ('LPG',                                                    'LPG',            null),
    ('F-Gas',                                                  'F-gas',          null),
    ('Renewables or Electrical',                               'Renewables',     'or Electrical — the title decides which'),
    ('I-GAS / OOS / Com MLP',                                  'IGAS',           null),
    ('WRAS / HWSS / L8 - Full Training',                       'Water',          null),
    ('ACOP 1-2-3',                                             'SGAS courses',   'ACOP / IGEM G1'),
    ('Auditing Gas Work (AGW) / Gas Safety Awareness / GSM L4', 'SGAS courses',  'auditing and gas safety awareness'),
    ('GL8 / CMDDA',                                            'ACS Commercial', 'GL8 and CMDDA sit under commercial'),
    ('MLP Week',                                               'IGAS',           'ASK SIMON — nobody is sure what MLP Week is')
  ) as v(name, scheme, note)
 where teamup_subcalendar.name = v.name;

update public.teamup_subcalendar set cal_role='person', cal_staff=v.staff, cal_where=v.w, cal_note=v.note
  from (values
    ('Keith Assessments',             2::bigint, null,     'courses Keith assessed'),
    ('Denis Assessments',             6::bigint, null,     'courses Denis assessed'),
    ('Phil Training',                 8::bigint, null,     'courses Phil taught'),
    ('Simon',                         5::bigint, null,     null),
    ('Simon WFH or Short Office Day', 5::bigint, 'wfh',    null),
    ('Spare',                         1::bigint, 'office', 'Steve Johnston — office days and contacts'),
    ('Spare1',                        1::bigint, null,     'Steve Johnston — assessments'),
    ('Spare2',                        1::bigint, 'wfh',    'Steve Johnston — off and working from home'),
    ('Spare3',                        5::bigint, 'office', 'Simon — office, assisting and meetings')
  ) as v(name, staff, w, note)
 where teamup_subcalendar.name = v.name;

update public.teamup_subcalendar
   set cal_role='person', cal_staff=null,
       cal_note='shared — the person comes from the title or another calendar'
 where name = 'Assessments';

update public.teamup_subcalendar set cal_role='off', cal_where='off'
 where name = 'Hols / Not Available';

update public.teamup_subcalendar set cal_role='where', cal_where=v.w, cal_note=v.note
  from (values
    ('On Site / Consultancy', 'on_site', 'a course delivered at a customer, or a visit with no course'),
    ('Meeting / Maintenance', 'meeting', null)
  ) as v(name, w, note)
 where teamup_subcalendar.name = v.name;

update public.teamup_subcalendar set cal_role='unknown' where cal_role is null;


create or replace function public.app_teamup_classify_run()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb; v_assessment_day bigint;
begin
  select course_id into v_assessment_day from course where name = 'Assessment day';

  with ev as (
    select e.event_id,
           coalesce(e.title,'') || ' ' || regexp_replace(coalesce(e.notes,''),'<[^>]+>',' ','g') as hay,
           coalesce(e.title,'') as t, e.subcalendar_ids
      from teamup_event e
     where not e.gone_from_teamup and not e.class_override
  ),
  -- what the calendars this event sits on are telling us
  cals as (
    select ev.event_id as cev,
           max(s.cal_scheme) filter (where s.cal_role='topic')   as cal_scheme,
           min(s.name)       filter (where s.cal_role='topic')   as topic_name,
           max(s.cal_staff)  filter (where s.cal_role='person')  as cal_staff,
           min(s.name)       filter (where s.cal_role='person')  as person_name,
           bool_or(s.cal_role='person')                          as on_person_cal,
           bool_or(s.cal_role='off')                             as on_off_cal,
           max(s.cal_where)  filter (where s.cal_role='person')  as person_where,
           bool_or(s.cal_role='where' and s.cal_where='on_site') as cal_on_site,
           bool_or(s.cal_role='where' and s.cal_where='meeting') as cal_meeting
      from ev left join teamup_subcalendar s on s.subcalendar_id = any(ev.subcalendar_ids)
     group by ev.event_id
  ),
  -- what the title is telling us
  hits as (
    select ev.event_id, h.pattern, h.scheme, h.means, h.where_kind,
           row_number() over (partition by ev.event_id, h.means order by length(h.pattern) desc) rk
      from ev join teamup_title_hint h
        on ev.t ~* ('(^|[^a-z0-9])' || regexp_replace(h.pattern,'([.*+?^${}()|\[\]\\-])','\\\1','g') || '([^a-z0-9]|$)')
  ),
  title_course as (select event_id tce, scheme title_scheme, pattern title_pattern from hits where means='course' and rk=1),
  title_stop as (
    select distinct on (event_id) event_id tse, means stop_means, where_kind stop_where, pattern stop_pattern
      from hits where means in ('closed','holiday','whereabouts','engagement')
     order by event_id,
              case means when 'closed' then 0 when 'holiday' then 1 when 'engagement' then 2 else 3 end,
              length(pattern) desc
  ),
  title_onsite as (select distinct event_id toe from hits where means='on_site'),
  title_person as (
    select distinct on (ev.event_id) ev.event_id tpe, p.assessor_id
      from ev join teamup_person_hint p
        on ev.t ~* ('(^|[^a-z0-9])' || regexp_replace(p.pattern,'([.*+?^${}()|\[\]\\-])','\\\1','g') || '([^a-z0-9]|$)')
     order by ev.event_id, length(p.pattern) desc
  ),
  -- what the Candidates list is telling us
  cands as (
    select l.event_id cde,
           count(*) filter (where not l.is_seat) named,
           count(*) filter (where l.is_seat)     seats,
           (select c.scheme from teamup_note_line l2
              join category c on upper(c.code) = any(
                    select upper(x) from unnest(string_to_array(
                      regexp_replace(l2.line,'[^A-Za-z0-9]',' ','g'),' ')) x)
             where l2.event_id = l.event_id
             group by c.scheme order by count(*) desc limit 1) as cand_scheme
      from teamup_note_line l group by l.event_id
  ),
  calc as (
    select ev.event_id, ev.t, (ev.hay ~* 't ?[&+] ?a') as ta,
           cal_scheme, topic_name, cal_staff, person_name, on_person_cal, on_off_cal,
           person_where, cal_on_site, cal_meeting,
           stop_means, stop_where, stop_pattern, title_scheme, title_pattern,
           coalesce(named,0) named, coalesce(seats,0) seats, cand_scheme,
           coalesce(toe is not null or cal_on_site, false) as on_site,
           coalesce(assessor_id, cal_staff) as staff_id,
           (assessor_id is not null) as staff_from_title,
           -- "SJ-Off AM/Office PM" is two half days in one entry, and was being
           -- stored as a whole day of whichever half won.
           case when ev.t ~* '(^|[^a-z])am([^a-z]|$)' and ev.t ~* '(^|[^a-z])pm([^a-z]|$)' then 'split'
                when ev.t ~* '(^|[^a-z])am([^a-z]|$)' then 'am'
                when ev.t ~* '(^|[^a-z])pm([^a-z]|$)' then 'pm' end as half
      from ev
      join cals          on cev = ev.event_id
      left join title_stop   on tse = ev.event_id
      left join title_course on tce = ev.event_id
      left join title_onsite on toe = ev.event_id
      left join title_person on tpe = ev.event_id
      left join cands        on cde = ev.event_id
  ),
  resolved as (
    select c.*,
           -- the course, best evidence first
           coalesce(c.title_scheme, c.cal_scheme, case when c.named > 0 then c.cand_scheme end) as scheme,
           case when c.title_scheme is not null then 'the title'
                when c.cal_scheme  is not null then 'the ' || c.topic_name || ' calendar'
                when c.named > 0 and c.cand_scheme is not null then 'the qualifications in Candidates'
                end as course_from,
           -- what kind of day
           case
             when c.stop_means = 'closed' then 'closed'
             -- a real course beats the calendar it happens to sit on
             when c.title_scheme is not null or c.cal_scheme is not null then 'course'
             when c.stop_means = 'holiday' then 'holiday'
             when c.stop_means in ('whereabouts','engagement') then c.stop_means
             when c.on_off_cal then 'holiday'
             when c.cal_meeting then 'engagement'
             when c.cal_on_site then 'engagement'
             when c.person_where is not null then 'whereabouts'
             -- somebody's own calendar with a delegate list on it: an
             -- assessment day, whatever it was they assessed
             when c.on_person_cal and c.named > 0 then 'course'
             -- nothing said. This used to fall through to "course".
             else 'unknown'
           end as kind
      from calc c
  )
  update teamup_event e
     set class_kind = r.kind,
         class_where = case when r.kind='whereabouts' then coalesce(r.stop_where, r.person_where, 'other') end,
         class_on_site = coalesce(r.on_site,false),
         class_ta = coalesce(r.ta,false),
         class_half = r.half,
         class_staff_id = case when r.kind='closed' then null else r.staff_id end,
         class_role = case when r.kind='course' then
             case when r.ta then 'both'
                  when r.person_name = 'Phil Training' then 'trainer'
                  when r.person_name like '%Assessments' then 'assessor'
                  when r.staff_id is not null then 'assessor' end end,
         class_course_id = case when r.kind='course' then coalesce(
             (select co.course_id from course co where co.scheme = r.scheme
               and co.name <> 'Assessment day' limit 1), v_assessment_day) end,
         class_course_from = case when r.kind='course' then coalesce(r.course_from,'nothing said') end,
         class_assessor_id = case when r.kind='course'
              and (r.ta or r.person_name is null or r.person_name <> 'Phil Training') then r.staff_id end,
         class_trainer_id = case when r.kind='course'
              and (r.ta or r.person_name = 'Phil Training') then r.staff_id end,
         class_review = coalesce(
              r.kind = 'unknown'
           or (r.kind='course' and r.scheme is null)
           or (r.kind in ('holiday','whereabouts') and r.staff_id is null)
           or coalesce(r.half,'') = 'split', true),
         class_why = (case
             when r.kind='closed' then 'the words "' || r.stop_pattern || '" — the centre is shut'
             when r.kind='unknown' then 'nothing in the title, the Candidates list or the calendars said what this is'
             when r.kind='course' then coalesce(r.course_from,'nothing') || ' said which course'
             when r.stop_pattern is not null then 'the word "' || r.stop_pattern || '"'
             when r.on_off_cal then 'it is on Hols / Not Available'
             when r.cal_meeting then 'it is on Meeting / Maintenance'
             when r.cal_on_site then 'it is on On Site / Consultancy'
             when r.person_where is not null then 'the ' || r.person_name || ' calendar'
             else 'the calendars it sits on' end)
             || case when r.staff_from_title then ' · the title names the person'
                     when r.staff_id is not null then ' · the ' || coalesce(r.person_name,'') || ' calendar names the person'
                     else '' end
             || case when r.ta then ' · T&A, so trained and assessed' else '' end
             || case when r.on_site then ' · on site at a customer' else '' end
             || case when coalesce(r.half,'')='split' then ' · two half days in one entry' else '' end
             || case when r.seats > 0 then ' · ' || r.seats || ' seats with no name yet' else '' end,
         classified_at = now()
    from resolved r where r.event_id = e.event_id;

  select jsonb_build_object(
    'events', count(*),
    'by_kind', (select jsonb_object_agg(coalesce(class_kind,'(none)'), n)
                  from (select class_kind, count(*) n from teamup_event where not gone_from_teamup group by 1) x),
    'course_from', (select jsonb_object_agg(coalesce(class_course_from,'-'), n)
                  from (select class_course_from, count(*) n from teamup_event
                         where not gone_from_teamup and class_kind='course' group by 1) y),
    'needing_a_look', count(*) filter (where class_review),
    'on_site', count(*) filter (where class_on_site),
    'half_days', count(*) filter (where class_half is not null),
    'with_a_person', count(*) filter (where class_staff_id is not null)
  ) into v_out from teamup_event where not gone_from_teamup;
  return v_out;
end;
$function$;


-- Initial or re-sit, from the R and I markers as they are actually written on
-- each delegate's line, rather than from the edge function's parse of them. A
-- day with both is no longer flagged: the course family is right, each delegate
-- carries their own marker, and picking one of two courses for a day that
-- genuinely had both is a question with no answer.
create or replace function public.app_teamup_pick_scheme_course()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $function$
declare v_out jsonb;
begin
  with multi as (
    select scheme from course where name <> 'Assessment day' group by scheme having count(*) > 1
  ),
  ev as (
    select e.event_id, c.scheme,
           count(*) filter (where l.marker='R') as re,
           count(*) filter (where l.marker='I') as ini
      from teamup_event e
      join course c on c.course_id = e.class_course_id
      join multi m on m.scheme = c.scheme
      left join teamup_note_line l on l.event_id = e.event_id
     where not e.gone_from_teamup and not e.class_override and e.class_kind='course'
     group by e.event_id, c.scheme
  )
  update teamup_event e
     set class_course_id = case
           when ev.re > 0 and ev.ini = 0 then
             (select course_id from course where scheme=ev.scheme and name ~* 'reassess' limit 1)
           when ev.ini > 0 and ev.re = 0 then
             (select course_id from course where scheme=ev.scheme and name !~* 'reassess'
               and name <> 'Assessment day' limit 1)
           else e.class_course_id end,
         class_why = e.class_why || case
           when ev.re > 0 and ev.ini = 0 then ' · everyone was re-sitting'
           when ev.ini > 0 and ev.re = 0 then ' · everyone was taking it for the first time'
           when ev.re > 0 and ev.ini > 0 then ' · a mix of re-sits and first-timers'
           else '' end
    from ev where ev.event_id = e.event_id;

  select jsonb_build_object(
    'by_course', (select jsonb_object_agg(nm, n) from (
        select coalesce((select name from course c where c.course_id=t.class_course_id),'—') nm, count(*) n
          from teamup_event t where not t.gone_from_teamup and t.class_kind='course' group by 1) z),
    'needing_a_look', count(*) filter (where class_review)
  ) into v_out from teamup_event where not gone_from_teamup;
  return v_out;
end;
$function$;
