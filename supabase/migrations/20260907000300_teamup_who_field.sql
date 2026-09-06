-- ─────────────────────────────────────────────────────────────────────────────
-- Teamup has a "who" field, and it is the answer to a question I was guessing.
--
-- 789 of the 1,235 events carry one and 735 of those name a member of staff.
-- Where it disagrees with what was read out of the title, IT is right and the
-- title is stale — the title records who was booked, "who" records who did it:
--
--   "(7)DB-HWSS T&A"      who = Keith    Denis was booked, Keith did it
--   "(4)KR-Assessments"   who = Denis
--   "(6)KR-CCN1"          who = Simon
--   "DB-Assist KR"        who = Denis    Denis assisting Keith, so Denis's day
--   "SG-Assessments / Liaise with Phil"  who = Simon, not Phil
--
-- It also holds the SECOND person where two ran a day together: "Denis (plus
-- Keith)", "Keith & Denis 9", "Steve and Simon", "SG/KR (Full)". Reading those
-- by longest-matching name picked whichever happened to be longer, so people
-- are taken in the order they are written instead.
--
-- This runs AFTER classification rather than inside it, so the order of
-- authority is explicit and visible: the classifier reads the calendars, the
-- title and the Candidates list, and then "who" has the last word on the person.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.teamup_event
  add column if not exists class_staff2_id  bigint references public.assessor(assessor_id) on delete set null,
  add column if not exists class_staff_from text;

-- Everyone named in a piece of text, in the order they are written.
create or replace function public.app_teamup_people_in(p_text text)
returns bigint[] language sql stable set search_path to 'public','extensions' as $$
  select coalesce(array_agg(assessor_id order by at), '{}'::bigint[])
    from (
      select distinct on (p.assessor_id) p.assessor_id,
             regexp_instr(coalesce(p_text,''),
               '(^|[^a-zA-Z0-9])' || p.pattern || '([^a-zA-Z0-9]|$)', 1, 1, 0, 'i') as at
        from teamup_person_hint p
       where coalesce(p_text,'') ~* ('(^|[^a-z0-9])' || p.pattern || '([^a-z0-9]|$)')
       order by p.assessor_id, at
    ) x
   where at > 0;
$$;

create or replace function public.app_teamup_apply_who()
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_out jsonb; v_changed int; v_second int;
begin
  with w as (
    select e.event_id, e.class_kind, e.class_ta, e.class_staff_id as was,
           app_teamup_people_in(e.who) as people
      from teamup_event e
     where not e.gone_from_teamup and not e.class_override
       and coalesce(btrim(e.who),'') <> ''
  ),
  named as (select * from w where array_length(people,1) >= 1)
  update teamup_event e
     set class_staff_id  = n.people[1],
         class_staff2_id = n.people[2],
         class_staff_from = 'the who field in Teamup',
         -- Two people on one day: the first assessed, the second is recorded
         -- alongside. Where the day was trained AND assessed, one of each.
         class_assessor_id = case when n.class_kind='course' then
             case when n.class_ta and n.people[2] is not null then n.people[2]
                  else n.people[1] end end,
         class_trainer_id = case when n.class_kind='course' and n.class_ta
             then n.people[1] end,
         class_review = case
             when e.class_review and n.class_kind in ('holiday','whereabouts')
               then false                       -- we know whose day it is now
             else e.class_review end,
         class_why = e.class_why
             || case when n.was is distinct from n.people[1]
                     then ' · the who field says ' ||
                          (select a.name from assessor a where a.assessor_id = n.people[1])
                     else '' end
             || case when n.people[2] is not null
                     then ' · with ' || (select a.name from assessor a where a.assessor_id = n.people[2])
                     else '' end
    from named n where n.event_id = e.event_id;
  get diagnostics v_changed = row_count;

  select count(*) into v_second from teamup_event
   where not gone_from_teamup and class_staff2_id is not null;

  select jsonb_build_object(
    'events_with_a_who', (select count(*) from teamup_event
                           where not gone_from_teamup and coalesce(btrim(who),'') <> ''),
    'who_named_somebody', v_changed,
    'two_people_on_the_day', v_second,
    'with_a_person', (select count(*) from teamup_event
                       where not gone_from_teamup and class_staff_id is not null),
    'still_needing_a_look', (select count(*) from teamup_event
                              where not gone_from_teamup and class_review)
  ) into v_out;
  return v_out;
end;
$$;

-- One button still. Read, settle initial-or-resit, let "who" have the last word
-- on the person, then put it all on the calendar.
create or replace function public.app_teamup_classify(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v jsonb; w jsonb; u jsonb; x jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  v := app_teamup_classify_run();
  w := app_teamup_pick_scheme_course();
  u := app_teamup_apply_who();
  x := app_teamup_promote_run();
  return v || w || u || x;
end;
$$;
