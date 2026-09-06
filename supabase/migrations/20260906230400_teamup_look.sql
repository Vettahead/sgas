-- ─────────────────────────────────────────────────────────────────────────────
-- The 273 events the classifier could not settle on its own.
--
-- The sub-calendar mapping screen this replaces asked for a decision per
-- calendar, which was the wrong unit — the calendars are not split by course
-- and never were. This asks per event, but groups the events by the REASON
-- they are unresolved, so a whole reason can be accepted in one click:
--
--   187  nothing in the title or the Candidates list said which course
--    50  a mix of re-sits and first-timers on the same day
--    16  the Candidates list did not say initial or re-sit
--    20  we cannot tell whose day this is
--
-- The first three are already filed as "Assessment day", which for most of them
-- is the true answer — a day where Keith assessed whoever turned up. So the
-- common case is confirming, not correcting, and confirming is one button for
-- the whole group.
--
-- Anything decided here sets class_override, so re-running the classifier after
-- another pull will not undo it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_teamup_look_reason(p_kind text, p_why text)
returns text language sql immutable as $$
  select case
    when p_kind <> 'course'                    then 'whose'
    when p_why like '%mix of re-sits%'         then 'mixed'
    when p_why like '%nothing said whether%'   then 'initial_or_resit'
    else 'which_course' end;
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
                 'until',    case when e.end_dt::date > e.start_dt::date then e.end_dt::date end,
                 'kind',     e.class_kind,
                 'why',      e.class_why,
                 'reason',   app_teamup_look_reason(e.class_kind, e.class_why),
                 'course_id',e.class_course_id,
                 'course',   c.name,
                 'staff_id', e.class_staff_id,
                 'person',   a.name,
                 'calendars',(select string_agg(s.name, ' · ' order by s.name)
                                from teamup_subcalendar s
                               where s.subcalendar_id = any(e.subcalendar_ids)),
                 'delegates',(select count(*) from teamup_event_delegate d where d.event_id = e.event_id),
                 'notes',    left(regexp_replace(coalesce(e.notes,''), '<[^>]+>', ' ', 'g'), 300)
               ) as x
          from teamup_event e
          left join course   c on c.course_id   = e.class_course_id
          left join assessor a on a.assessor_id = e.class_staff_id
         where not e.gone_from_teamup and e.class_review
         order by e.start_dt desc
         limit 600
      ) y
    ),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('course_id', course_id, 'name', name) order by name), '[]'::jsonb) from course),
    'people',  (select coalesce(jsonb_agg(jsonb_build_object('staff_id', assessor_id, 'name', name) order by name), '[]'::jsonb)
                  from assessor where left_on is null or left_on > current_date - interval '8 years')
  ) into v_out;
  return v_out;
end;
$$;

-- ── acting on one event, or on a whole reason at once ────────────────────────
-- keep    — it is right as filed; stop asking
-- course  — it was this course
-- person  — it was this person's day
-- kind    — it is not a course at all (holiday, working from home, office, ...)
create or replace function public.app_teamup_look_act(
  p_admin text, p_admin_pw text, p_action text,
  p_event_id text default null, p_reason text default null,
  p_course_id bigint default null, p_staff_id bigint default null,
  p_kind text default null, p_where text default null
) returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_n int;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  if p_event_id is null and p_reason is null then
    raise exception 'Say which event, or which reason';
  end if;
  if p_reason is not null and p_action <> 'keep' then
    raise exception 'A whole group can only be kept, not rewritten';
  end if;

  if p_action = 'keep' then
    update teamup_event e set class_review = false, class_override = true
     where not e.gone_from_teamup and e.class_review
       and (p_event_id is null or e.event_id = p_event_id)
       and (p_reason  is null or app_teamup_look_reason(e.class_kind, e.class_why) = p_reason);

  elsif p_action = 'course' then
    if p_course_id is null then raise exception 'Which course?'; end if;
    update teamup_event e
       set class_kind = 'course', class_course_id = p_course_id,
           class_course_from = 'somebody said so', class_where = null,
           class_review = false, class_override = true,
           class_assessor_id = coalesce(e.class_assessor_id, e.class_staff_id),
           class_why = e.class_why || ' · somebody said which course'
     where e.event_id = p_event_id;

  elsif p_action = 'person' then
    if p_staff_id is null then raise exception 'Which person?'; end if;
    update teamup_event e
       set class_staff_id = p_staff_id,
           class_assessor_id = case when e.class_kind = 'course'
                                    and coalesce(e.class_trainer_id, 0) <> p_staff_id
                                    then p_staff_id else e.class_assessor_id end,
           class_review = false, class_override = true,
           class_why = e.class_why || ' · somebody said whose day it was'
     where e.event_id = p_event_id;

  elsif p_action = 'kind' then
    if p_kind is null then raise exception 'Which kind of day?'; end if;
    if p_kind not in ('course','holiday','whereabouts','engagement','closed') then
      raise exception 'Not a kind of day this understands';
    end if;
    update teamup_event e
       set class_kind = p_kind,
           class_where = case when p_kind = 'whereabouts' then coalesce(p_where,'other') end,
           class_course_id = case when p_kind = 'course' then e.class_course_id end,
           class_staff_id = coalesce(p_staff_id, e.class_staff_id),
           class_review = (p_kind <> 'closed' and coalesce(p_staff_id, e.class_staff_id) is null),
           class_override = true,
           class_why = e.class_why || ' · somebody said what kind of day it was'
     where e.event_id = p_event_id;

  else
    raise exception 'Not something this knows how to do';
  end if;

  get diagnostics v_n = row_count;
  perform app_teamup_promote_run();
  return jsonb_build_object(
    'changed', v_n,
    'still_needing_a_look', (select count(*) from teamup_event where not gone_from_teamup and class_review)
  );
end;
$$;

revoke all on function public.app_teamup_look(text, text) from public, anon;
revoke all on function public.app_teamup_look_act(text, text, text, text, text, bigint, bigint, text, text) from public, anon;
grant execute on function public.app_teamup_look(text, text) to authenticated;
grant execute on function public.app_teamup_look_act(text, text, text, text, text, bigint, bigint, text, text) to authenticated;
