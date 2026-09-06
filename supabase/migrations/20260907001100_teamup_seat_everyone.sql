-- ─────────────────────────────────────────────────────────────────────────────
-- Everybody named on a course goes on that course.
--
-- Chris: "I'm still finding previous courses we've done that don't have
-- candidates attached to them... some are just empty."
--
-- He was right, and the cause was a wrong assumption of mine rather than a bug.
-- I had treated the old Access database as the record of who was on a course,
-- and Teamup as something to LINK to it — so a delegate only appeared if an
-- Access assessment could be found for them within three weeks of the date.
--
-- Measured across every course: 2,632 names written on the calendar, 829 on.
-- 201 courses had names written and not one person attached. Why:
--
--   1,264  the person is not in the system at all
--     675  the person IS here, but no Access assessment near that date
--     490  linked, but not confidently enough to be placed
--     229  their one Access booking had already been claimed by another course
--
-- Access holds assessment OUTCOMES, and that is not the same thing as who sat
-- in the room. It has nothing for somebody who trained but was not assessed,
-- who was booked and did not turn up, or who came after 27 August where the
-- extract stops. Teamup's Candidates list IS the attendance record, and it is
-- the thing to trust.
--
-- So: everybody named goes on. Their Access assessment is attached where one
-- can be found near the date, because that keeps the qualification history
-- joined to the day it was earned; otherwise a booking is created. Somebody not
-- on file is created and marked as needing confirming. The only ones left out
-- are names belonging to two different delegates — guessing between two real
-- people is the one thing that must not be automated, and those 98 go to the
-- review screen instead.
--
-- Result: 2,496 of 2,632 seated across 424 courses. Courses with names written
-- and nobody on them: 2. Sixty-nine courses have no names in Teamup at all,
-- which is the source being empty rather than anything here.
--
-- Running it twice changes nothing. The first attempt failed that — the people
-- it created made their own names ambiguous on the next pass and it seated them
-- a second time — so a person already sat on a course is now recognised by NAME
-- as well as by id, and where a name matches both somebody on file and somebody
-- created from the calendar, the one on file wins.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.booking
  add column if not exists from_teamup_event_id text,
  add column if not exists seated_from_teamup boolean not null default false;
create index if not exists booking_from_teamup_idx on public.booking (from_teamup_event_id)
  where from_teamup_event_id is not null;

create or replace function public.app_teamup_seat_everyone()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb; v_people int := 0; v_attached int := 0; v_created int := 0; v_amb int := 0;
begin
  -- one row per person per course, however many days they are written on
  create temporary table _seat on commit drop as
  select distinct on (te.session_id, upper(l.noted_name))
         te.session_id, te.event_id, s.start_date, l.line, l.noted_name, l.marker, l.sgas_no,
         split_part(l.noted_name,' ',1) as fore, split_part(l.noted_name,' ',2) as sur,
         array(select distinct upper(w)
                 from unnest(string_to_array(regexp_replace(l.line,'[^A-Za-z0-9]',' ','g'),' ')) w
                where length(w) between 3 and 12) as words
    from teamup_note_line l
    join teamup_event te on te.event_id = l.event_id
    join session s on s.session_id = te.session_id and s.from_teamup
   where not l.is_seat and l.noted_name is not null and l.noted_name ~ '\s'
     -- an admin line is not a person: "Edina Send Cert To Work", "Hold Paperwork"
     and upper(split_part(l.noted_name,' ',2)) not in
         ('SEND','CERT','WORK','ONLY','TBC','WIP','X','AND','PLUS','WEEK','DAY',
          'ASSESSMENT','PAPERWORK','REQUIRED','ISSUE','BOOKS')
   order by te.session_id, upper(l.noted_name), l.sgas_no nulls last, l.event_id;

  -- Already sat on that course under that name: nothing to do. Checking the
  -- NAME and not only the id is what makes a second run a no-op.
  delete from _seat f
   where exists (select 1 from booking b join client c on c.client_id = b.client_id
                  where b.session_id = f.session_id
                    and upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore));

  alter table _seat add column client_id bigint;
  alter table _seat add column how text;

  -- 1. the SGAS number is exact, so it wins
  update _seat f set client_id = r.client_id, how = 'the SGAS number'
    from stg_access_record r
   where f.sgas_no is not null and r.id_number = f.sgas_no::text and r.client_id is not null
     and exists (select 1 from client c where c.client_id = r.client_id
                  and levenshtein(upper(c.surname), upper(f.sur)) <= 2);

  -- 2. otherwise the name — somebody properly on file first, and only when the
  -- name belongs to exactly one of them
  update _seat f set client_id = (select c.client_id from client c
       where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
         and not c.needs_confirming limit 1), how = 'their name'
   where f.client_id is null
     and (select count(*) from client c
           where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
             and not c.needs_confirming) = 1;

  -- 2b. else somebody created from the calendar on an earlier run
  update _seat f set client_id = (select c.client_id from client c
       where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
         and c.needs_confirming limit 1), how = 'created from the calendar earlier'
   where f.client_id is null
     and (select count(*) from client c
           where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
             and not c.needs_confirming) = 0
     and (select count(*) from client c
           where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
             and c.needs_confirming) = 1;

  select count(*) into v_amb from _seat where client_id is null
     and (select count(*) from client c where upper(c.surname) = upper(_seat.sur)
           and app_same_forename(c.forename, _seat.fore)) > 1;

  -- 3. anybody left is somebody we have never had
  with mk as (
    insert into client (forename, surname, from_teamup_line, needs_confirming)
    select distinct f.fore, f.sur, left(f.line,200), true
      from _seat f
     where f.client_id is null
       and (select count(*) from client c
             where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)) = 0
    returning client_id
  ) select count(*) into v_people from mk;

  update _seat f set client_id = c.client_id, how = 'created from the calendar'
    from client c
   where f.client_id is null and c.needs_confirming
     and upper(c.forename) = upper(f.fore) and upper(c.surname) = upper(f.sur);

  delete from _seat where client_id is null;
  delete from _seat f using booking b
   where b.session_id = f.session_id and b.client_id = f.client_id;

  -- 4. attach the assessment already held for that person near that date, so
  -- the qualification history stays joined to the day it was earned
  with pick as (
    select distinct on (f.session_id, f.client_id) f.session_id, f.client_id, b.booking_id
      from _seat f
      join booking b on b.client_id = f.client_id and b.session_id is null
      join stg_access_record r on r.booking_id = b.booking_id
     where abs(r.assessed_on::date - f.start_date) <= 21
     order by f.session_id, f.client_id, abs(r.assessed_on::date - f.start_date)
  ),
  once as (select distinct on (booking_id) booking_id, session_id from pick order by booking_id, session_id),
  upd as (
    update booking b set session_id = o.session_id, seated_from_teamup = true
      from once o where b.booking_id = o.booking_id and b.session_id is null
    returning b.booking_id
  ) select count(*) into v_attached from upd;

  delete from _seat f using booking b
   where b.session_id = f.session_id and b.client_id = f.client_id;

  -- 5. everybody still standing gets a booking of their own
  with mk as (
    insert into booking (client_id, session_id, overall_result, is_reassessment, company_id,
                         from_teamup_event_id, seated_from_teamup)
    select f.client_id, f.session_id, 'PENDING', coalesce(f.marker,'') = 'R',
           (select c.company_id from client c where c.client_id = f.client_id), f.event_id, true
      from _seat f
    returning booking_id
  ) select count(*) into v_created from mk;

  insert into booking_category (booking_id, category_id, result, is_reassessment)
  select b.booking_id, c.category_id, 'PENDING', coalesce(f.marker,'') = 'R'
    from _seat f
    join booking b on b.session_id = f.session_id and b.client_id = f.client_id and b.seated_from_teamup
    join category c on upper(c.code) = any(f.words)
  on conflict do nothing;

  select jsonb_build_object(
    'people_created', v_people,
    'assessments_attached', v_attached,
    'bookings_created', v_created,
    'name_belongs_to_two_people_so_left_alone', v_amb,
    'names_on_the_calendar', (select count(distinct (te.session_id::text||upper(l.noted_name)))
        from teamup_event te join teamup_note_line l on l.event_id=te.event_id
       where te.session_id is not null and not l.is_seat and l.noted_name is not null),
    'delegates_on_a_course', (select count(*) from booking where session_id is not null),
    'courses_with_people',   (select count(distinct session_id) from booking where session_id is not null),
    'still_waiting',         (select count(*) from booking where session_id is null and overall_result='PENDING')
  ) into v_out;
  return v_out;
end;
$$;

-- The 98 seats where the name belongs to two different delegates. Each one
-- shows the line it came from and every person it could be, with their town,
-- date of birth and when they were last here, because that is what tells two
-- people of the same name apart.
create or replace function public.app_teamup_shared_names(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'start'), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'session_id', te.session_id, 'start', s.start_date, 'course', co.name,
      'noted_name', l.noted_name, 'line', left(l.line,110),
      'candidates', (select coalesce(jsonb_agg(jsonb_build_object(
            'client_id', c.client_id, 'name', c.forename||' '||c.surname,
            'town', c.town, 'dob', c.dob,
            'last_here', (select max(r.assessed_on::date) from booking b
                            join stg_access_record r on r.booking_id=b.booking_id
                           where b.client_id=c.client_id)) order by c.surname, c.forename), '[]'::jsonb)
          from client c where upper(c.surname)=upper(split_part(l.noted_name,' ',2))
            and app_same_forename(c.forename, split_part(l.noted_name,' ',1)))
    ) as x
    from teamup_note_line l
    join teamup_event te on te.event_id = l.event_id
    join session s on s.session_id = te.session_id and s.from_teamup
    join course co on co.course_id = s.course_id
   where not l.is_seat and l.noted_name is not null and l.noted_name ~ '\s'
     and (select count(*) from client c where upper(c.surname)=upper(split_part(l.noted_name,' ',2))
           and app_same_forename(c.forename, split_part(l.noted_name,' ',1))) > 1
     and not exists (select 1 from booking b join client c on c.client_id=b.client_id
                      where b.session_id = te.session_id
                        and upper(c.surname)=upper(split_part(l.noted_name,' ',2))
                        and app_same_forename(c.forename, split_part(l.noted_name,' ',1)))
   group by te.session_id, s.start_date, co.name, l.noted_name, l.line
  ) y;
  return v_out;
end;
$$;

revoke all on function public.app_teamup_shared_names(text,text) from public, anon;
grant execute on function public.app_teamup_shared_names(text,text) to authenticated;

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
  b := app_teamup_seat_everyone();
  return v || u || r || g || x || b;
end;
$$;
