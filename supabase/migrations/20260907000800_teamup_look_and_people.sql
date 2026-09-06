-- ─────────────────────────────────────────────────────────────────────────────
-- What is left to look at, and the people the import had to invent.
--
-- The events are grouped by the REASON the classifier could not settle them,
-- because the reason is the decision — "17 events never said which course" is
-- one answer, not 17. Each event now carries its Candidates list and its "who"
-- field on screen, so the answer can be worked out from the same words the
-- computer was looking at rather than by opening Teamup alongside.
--
-- Separately: 72 people were created from a name typed into a calendar note so
-- that courses still to come are not empty. That is a provisional record, not a
-- delegate anybody has checked in, and it must not quietly become one. Each is
-- shown with the line it came from, what it is booked onto, and anyone already
-- on file with a near-identical name — because the likeliest mistake is a
-- second copy of somebody we already have.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_look_reason(p_kind text, p_why text)
returns text language sql immutable as $$
  select case
    when p_kind = 'unknown'                  then 'cannot_read'
    when p_why like '%two half days%'        then 'split'
    when p_why like '%nothing said which%'   then 'which_course'
    when p_why like '%mix of re-sits%'       then 'mixed'
    when p_kind <> 'course'                  then 'whose'
    else 'other' end;
$$;

create or replace function public.app_teamup_look(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  select jsonb_build_object(
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n) order by n desc), '[]'::jsonb)
        from (select app_teamup_look_reason(class_kind, class_why) reason, count(*) n
                from teamup_event where not gone_from_teamup and class_review group by 1) b
    ),
    'events', (
      select coalesce(jsonb_agg(x order by x->>'on' desc), '[]'::jsonb) from (
        select jsonb_build_object(
                 'event_id', e.event_id,
                 'title',    coalesce(nullif(btrim(e.title),''), '(no title)'),
                 'on',       e.start_dt::date,
                 'until',    case when coalesce(e.end_dt::date,e.start_dt::date) > e.start_dt::date
                                  then e.end_dt::date end,
                 'kind',     e.class_kind,
                 'why',      e.class_why,
                 'who',      nullif(btrim(e.who),''),
                 'reason',   app_teamup_look_reason(e.class_kind, e.class_why),
                 'course_id',e.class_course_id, 'course', c.name,
                 'staff_id', e.class_staff_id,  'person', a.name,
                 'calendars',(select string_agg(s.name, ' · ' order by s.name)
                                from teamup_subcalendar s
                               where s.subcalendar_id = any(e.subcalendar_ids)),
                 'delegates',(select count(*) from teamup_note_line l
                               where l.event_id = e.event_id and not l.is_seat),
                 'lines',    (select coalesce(jsonb_agg(left(l.line,110) order by l.line_no), '[]'::jsonb)
                                from teamup_note_line l where l.event_id = e.event_id)
               ) as x
          from teamup_event e
          left join course   c on c.course_id   = e.class_course_id
          left join assessor a on a.assessor_id = e.class_staff_id
         where not e.gone_from_teamup and e.class_review
         order by e.start_dt desc limit 400
      ) y
    ),
    'provisional_people', (
      select coalesce(jsonb_agg(p order by p->>'surname'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'client_id', c.client_id,
                 'forename', c.forename, 'surname', c.surname,
                 'from_line', c.from_teamup_line,
                 'booked_on', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'start', s.start_date, 'course', co.name) order by s.start_date), '[]'::jsonb)
                                 from booking b join session s on s.session_id = b.session_id
                                 join course co on co.course_id = s.course_id
                                where b.client_id = c.client_id),
                 -- the likeliest mistake is a second copy of somebody we have
                 'looks_like', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'client_id', o.client_id,
                                   'name', o.forename || ' ' || o.surname,
                                   'town', o.town) order by o.surname), '[]'::jsonb)
                                  from client o
                                 where not o.needs_confirming
                                   and levenshtein(upper(o.surname), upper(c.surname)) <= 1
                                   and upper(left(o.forename,1)) = upper(left(c.forename,1)))
               ) as p
          from client c where c.needs_confirming
      ) z
    ),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('course_id', course_id, 'name', name) order by name), '[]'::jsonb) from course),
    'people',  (select coalesce(jsonb_agg(jsonb_build_object('staff_id', assessor_id, 'name', name) order by name), '[]'::jsonb)
                  from assessor where left_on is null or left_on > current_date - interval '8 years')
  ) into v_out;
  return v_out;
end;
$$;

-- confirm — this really is a new person, keep them
-- merge   — they are somebody we already have. The bookings move FIRST so
--           nothing is ever orphaned, and a booking that would put the same
--           person on a course twice is dropped rather than colliding.
create or replace function public.app_teamup_person_act(
  p_admin text, p_admin_pw text, p_action text,
  p_client_id bigint, p_into_client_id bigint default null
) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_moved int := 0;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  if p_action = 'confirm' then
    update client set needs_confirming = false where client_id = p_client_id;

  elsif p_action = 'merge' then
    if p_into_client_id is null or p_into_client_id = p_client_id then
      raise exception 'Say who they are the same as';
    end if;
    delete from booking b
     where b.client_id = p_client_id
       and exists (select 1 from booking x
                    where x.client_id = p_into_client_id and x.session_id is not distinct from b.session_id);
    update booking set client_id = p_into_client_id where client_id = p_client_id;
    get diagnostics v_moved = row_count;
    delete from client where client_id = p_client_id and needs_confirming;

  else raise exception 'Not something this knows how to do';
  end if;

  return jsonb_build_object(
    'bookings_moved', v_moved,
    'still_to_confirm', (select count(*) from client where needs_confirming));
end;
$$;

revoke all on function public.app_teamup_person_act(text,text,text,bigint,bigint) from public, anon;
grant execute on function public.app_teamup_person_act(text,text,text,bigint,bigint) to authenticated;
