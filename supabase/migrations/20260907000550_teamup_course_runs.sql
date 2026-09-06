-- ─────────────────────────────────────────────────────────────────────────────
-- A course that runs over several days is ONE course, not one per day.
--
-- Teamup records each day as its own event with the same Candidates list pasted
-- on it. 1 September "(9) OFTEC SG" and 2 September "(9) DB assist OFTEC & CCN"
-- are the same six people on a two-day course. Stored as separate days a
-- delegate can only sit on one of them — they hold one booking — so the rest of
-- the course looks empty. 332 of 755 person-and-course combinations span more
-- than one day, so this is most of the calendar, not an edge case.
--
-- Two days belong to the same course when ALL of these hold:
--   * the same course
--   * within 3 days of each other, which bridges a weekend
--   * they share at least one delegate
--
-- That last test is doing the real work. Domestic reassessments run most days
-- of the week with completely different people; without it the whole year would
-- collapse into one enormous course.
--
-- The grouping is by CONNECTED PAIRS, not by walking the list in date order.
-- Walking the list breaks as soon as something unrelated sits between two days:
-- "(9)+1 Tues Commercial" on the 14th and "(10) Commercial" on the 16th are the
-- same ten people, but an unrelated "Aggreko Train the trainer" running 14–18
-- fell between them in date order, shared no delegates, and cut the run in two.
-- Joining every qualifying pair and then taking the connected groups puts A and
-- C on one course because both touch B, whatever else falls between them.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.teamup_event
  add column if not exists run_anchor text,
  add column if not exists run_days   int;

create or replace function public.app_teamup_group_runs()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb; v_moved int;
begin
  create temporary table _ev on commit drop as
    select e.event_id, e.class_course_id,
           e.start_dt::date d, coalesce(e.end_dt::date, e.start_dt::date) de,
           -- how we recognise the same person on two days: their SGAS number
           -- if they have one, otherwise the name as written
           coalesce((select array_agg(distinct coalesce(l.sgas_no::text, upper(l.noted_name)))
                       from teamup_note_line l
                      where l.event_id = e.event_id and not l.is_seat
                        and (l.sgas_no is not null or l.noted_name is not null)), '{}'::text[]) as who,
           e.event_id as comp
      from teamup_event e
     where not e.gone_from_teamup and e.class_kind = 'course' and e.start_dt is not null
       and e.class_course_id is not null;

  create temporary table _edge on commit drop as
    select a.event_id as x, b.event_id as y
      from _ev a join _ev b
        on a.class_course_id = b.class_course_id and a.event_id < b.event_id
       and a.d - b.de <= 3 and b.d - a.de <= 3
       and a.who && b.who;

  -- settle the groups: push every pair down to the lower of the two labels
  -- until nothing moves
  loop
    with m as (
      select e.x, e.y, least(a.comp, b.comp) as lo
        from _edge e join _ev a on a.event_id = e.x join _ev b on b.event_id = e.y
       where a.comp <> b.comp
    ),
    lowest as (
      select event_id, min(lo) lo from (
        select x as event_id, lo from m union all select y, lo from m
      ) z group by event_id
    )
    update _ev v set comp = l.lo from lowest l
     where v.event_id = l.event_id and v.comp <> l.lo;
    get diagnostics v_moved = row_count;
    exit when v_moved = 0;
  end loop;

  update teamup_event e set run_anchor = v.comp, run_days = c.n
    from _ev v
    join (select comp, count(*) n from _ev group by comp) c on c.comp = v.comp
   where e.event_id = v.event_id;

  update teamup_event set run_anchor = null, run_days = null
   where class_kind <> 'course' and run_anchor is not null;

  select jsonb_build_object(
    'course_days', count(*),
    'courses_after_joining_the_days_up', count(distinct run_anchor),
    'runs_of_one_day',   count(distinct run_anchor) filter (where run_days = 1),
    'runs_of_2_to_4',    count(distinct run_anchor) filter (where run_days between 2 and 4),
    'runs_of_5_or_more', count(distinct run_anchor) filter (where run_days >= 5),
    'longest_run_days',  max(run_days)
  ) into v_out from teamup_event where not gone_from_teamup and class_kind='course';
  return v_out;
end;
$$;
