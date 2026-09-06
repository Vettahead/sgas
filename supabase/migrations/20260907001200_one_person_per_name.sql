-- ─────────────────────────────────────────────────────────────────────────────
-- One person per name, not one per note.
--
-- Chris found Darren Atkinson five times over in the delegate list. A plain
-- mistake: the insert read
--
--     select distinct f.fore, f.sur, left(f.line,200), true
--
-- and the DISTINCT covered the LINE as well as the name, so one person written
-- five different ways became five different people:
--
--   "Darren Atkinson"
--   "Darren Atkinson - Level 4 Catering"
--   "Darren Atkinson (Essity)"
--   "Darren Atkinson (missed week 1, so needs a copy of the legislation)"
--   "Darren Atkinson (will miss week 1, so needs a copy of the legislation)"
--
-- Only the first of the five ever got bookings, so the other four were dead
-- records cluttering the delegate list. 124 duplicates out of 871 people
-- created. They are merged here keeping the earliest record, and the function
-- now takes ONE ROW PER NAME with the shortest line kept as the note it came
-- from — the line is chosen, not grouped on.
--
-- What is left after this: 747 people from the calendar with no duplicated
-- names among them, and 67 names shared by two records that BOTH came out of
-- the old Access import. Those are not this bug — the import deliberately kept
-- uncertain matches apart, because two people merged into one cannot be
-- untangled afterwards and a duplicate can. They are on the Import review tab.
-- ─────────────────────────────────────────────────────────────────────────────

with keep as (
  select upper(forename) uf, upper(surname) us, min(client_id) keeper
    from client where needs_confirming group by 1,2 having count(*) > 1
),
dupe as (
  select c.client_id, k.keeper from client c
    join keep k on k.uf = upper(c.forename) and k.us = upper(c.surname)
   where c.needs_confirming and c.client_id <> k.keeper
),
-- a person sits a course once: drop a booking that would collide
gone as (
  delete from booking b using dupe d
   where b.client_id = d.client_id
     and exists (select 1 from booking x
                  where x.client_id = d.keeper and x.session_id is not distinct from b.session_id)
  returning 1
),
moved as (
  update booking b set client_id = d.keeper from dupe d where b.client_id = d.client_id
  returning 1
)
delete from client c using dupe d where c.client_id = d.client_id;

create or replace function public.app_teamup_seat_everyone()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb; v_people int := 0; v_attached int := 0; v_created int := 0; v_amb int := 0;
begin
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
     and upper(split_part(l.noted_name,' ',2)) not in
         ('SEND','CERT','WORK','ONLY','TBC','WIP','X','AND','PLUS','WEEK','DAY',
          'ASSESSMENT','PAPERWORK','REQUIRED','ISSUE','BOOKS')
   order by te.session_id, upper(l.noted_name), l.sgas_no nulls last, l.event_id;

  -- already sat on that course under that name: nothing to do, and checking the
  -- NAME rather than only the id is what makes a second run a no-op
  delete from _seat f
   where exists (select 1 from booking b join client c on c.client_id = b.client_id
                  where b.session_id = f.session_id
                    and upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore));

  alter table _seat add column client_id bigint;
  alter table _seat add column how text;

  update _seat f set client_id = r.client_id, how = 'the SGAS number'
    from stg_access_record r
   where f.sgas_no is not null and r.id_number = f.sgas_no::text and r.client_id is not null
     and exists (select 1 from client c where c.client_id = r.client_id
                  and levenshtein(upper(c.surname), upper(f.sur)) <= 2);

  update _seat f set client_id = (select c.client_id from client c
       where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
         and not c.needs_confirming limit 1), how = 'their name'
   where f.client_id is null
     and (select count(*) from client c
           where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)
             and not c.needs_confirming) = 1;

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

  -- ONE ROW PER NAME. The line is CHOSEN, not grouped on — grouping on it as
  -- well is what turned one Darren Atkinson into five.
  with wanted as (
    select distinct on (upper(f.fore), upper(f.sur)) f.fore, f.sur, f.line
      from _seat f
     where f.client_id is null
       and (select count(*) from client c
             where upper(c.surname) = upper(f.sur) and app_same_forename(c.forename, f.fore)) = 0
     order by upper(f.fore), upper(f.sur), length(f.line)
  ),
  mk as (
    insert into client (forename, surname, from_teamup_line, needs_confirming)
    select fore, sur, left(line,200), true from wanted
    returning client_id
  ) select count(*) into v_people from mk;

  update _seat f set client_id = c.client_id, how = 'created from the calendar'
    from client c
   where f.client_id is null and c.needs_confirming
     and upper(c.forename) = upper(f.fore) and upper(c.surname) = upper(f.sur);

  delete from _seat where client_id is null;
  delete from _seat f using booking b
   where b.session_id = f.session_id and b.client_id = f.client_id;

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
    'people_from_the_calendar', (select count(*) from client where needs_confirming),
    'any_duplicated_names', (select count(*) - count(distinct upper(forename)||'|'||upper(surname))
                               from client where needs_confirming),
    'delegates_on_a_course', (select count(*) from booking where session_id is not null),
    'courses_with_people',   (select count(distinct session_id) from booking where session_id is not null),
    'still_waiting',         (select count(*) from booking where session_id is null and overall_result='PENDING')
  ) into v_out;
  return v_out;
end;
$$;
