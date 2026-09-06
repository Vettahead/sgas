-- ─────────────────────────────────────────────────────────────────────────────
-- The forward diary — the whole reason for getting out of Teamup before October.
--
-- 48 courses are still to come with delegates named on them, and not one could
-- be linked, because linking attaches an assessment that ALREADY HAPPENED and
-- these have not happened yet. There is nothing in the old database to point
-- at. They need bookings CREATING.
--
-- Of the delegates named: some are people already on file, some share a name
-- with more than one person on file, and most have never been here before —
-- which is what a forward diary looks like, since most are first-timers.
--
-- People not on file are created, and marked as having come from the calendar
-- rather than from anybody checking them in, because a name typed into a
-- calendar note is not a verified record. Where a name matches two people on
-- file nothing is created: guessing which of two real people is coming is
-- exactly the sort of thing that must not be automated.
--
-- Lines that are admin rather than people are excluded — "Edina Send Cert To
-- Work", "Logic Appleby x 1 (TBC)". A real delegate line carries either an SGAS
-- number or a qualification code.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.client
  add column if not exists from_teamup_line text,
  add column if not exists needs_confirming boolean not null default false;

create or replace function public.app_teamup_book_the_future()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb; v_made_people int; v_made_bookings int; v_ambiguous int; v_cats int;
begin
  create temporary table _fut on commit drop as
  select distinct on (te.session_id, upper(l.noted_name))
         te.session_id, l.event_id, l.line, l.noted_name, l.marker, l.sgas_no,
         split_part(l.noted_name,' ',1) as fore,
         split_part(l.noted_name,' ',2) as sur,
         array(select distinct upper(w)
                 from unnest(string_to_array(regexp_replace(l.line,'[^A-Za-z0-9]',' ','g'),' ')) w
                where length(w) between 3 and 12) as words
    from teamup_note_line l
    join teamup_event te on te.event_id = l.event_id
    join session s on s.session_id = te.session_id
   where s.from_teamup and s.start_date > current_date
     and not l.is_seat and l.noted_name is not null and l.noted_name ~ '\s'
     and upper(split_part(l.noted_name,' ',2)) not in
         ('SEND','CERT','WORK','ONLY','TBC','WIP','X','AND','PLUS','WEEK','DAY','ASSESSMENT')
     and (l.sgas_no is not null or exists (
            select 1 from category c where upper(c.code) = any(
              array(select distinct upper(w)
                      from unnest(string_to_array(regexp_replace(l.line,'[^A-Za-z0-9]',' ','g'),' ')) w))))
   order by te.session_id, upper(l.noted_name), l.sgas_no nulls last;

  alter table _fut add column client_id bigint;
  alter table _fut add column matches int;

  update _fut f set matches = (select count(*) from client c
     where upper(c.surname) = upper(f.sur)
       and (upper(c.forename) = upper(f.fore) or upper(left(c.forename,1)) = upper(left(f.fore,1))));

  update _fut f set client_id = (select c.client_id from client c
     where upper(c.surname) = upper(f.sur)
       and (upper(c.forename) = upper(f.fore) or upper(left(c.forename,1)) = upper(left(f.fore,1)))
     limit 1)
   where f.matches = 1;

  with mk as (
    insert into client (forename, surname, from_teamup_line, needs_confirming)
    select distinct f.fore, f.sur, left(f.line,200), true
      from _fut f where f.matches = 0
    returning client_id
  ) select count(*) into v_made_people from mk;

  update _fut f set client_id = c.client_id
    from client c
   where f.matches = 0 and f.client_id is null
     and upper(c.forename) = upper(f.fore) and upper(c.surname) = upper(f.sur)
     and c.needs_confirming;

  select count(*) into v_ambiguous from _fut where matches > 1;

  with mk as (
    insert into booking (client_id, session_id, overall_result, is_reassessment, company_id)
    select f.client_id, f.session_id, 'PENDING', coalesce(f.marker,'') = 'R',
           (select c.company_id from client c where c.client_id = f.client_id)
      from _fut f
     where f.client_id is not null
       and not exists (select 1 from booking b
                        where b.session_id = f.session_id and b.client_id = f.client_id)
    returning booking_id
  ) select count(*) into v_made_bookings from mk;

  -- what each of them is booked ON, from the codes written on the line
  with cats as (
    insert into booking_category (booking_id, category_id, result, is_reassessment)
    select b.booking_id, c.category_id, 'PENDING', coalesce(f.marker,'') = 'R'
      from _fut f
      join booking b on b.session_id = f.session_id and b.client_id = f.client_id
      join category c on upper(c.code) = any(f.words)
     where b.overall_result = 'PENDING'
    on conflict do nothing
    returning 1
  ) select count(*) into v_cats from cats;

  select jsonb_build_object(
    'courses_still_to_come', (select count(*) from session
                               where from_teamup and start_date > current_date),
    'delegates_named',       (select count(*) from _fut),
    'already_on_file',       (select count(*) from _fut where matches = 1),
    'new_people_created',    v_made_people,
    'name_shared_so_left_alone', v_ambiguous,
    'bookings_created',      v_made_bookings,
    'qualifications_booked', v_cats,
    'courses_with_people_now', (select count(distinct session_id) from booking where session_id is not null)
  ) into v_out;
  return v_out;
end;
$$;
