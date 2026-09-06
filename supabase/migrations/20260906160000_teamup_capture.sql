-- ── TEAMUP CAPTURE ──────────────────────────────────────────────────────────
-- SGAS's real working schedule lives in Teamup and the subscription lapses in
-- October. Nothing has ever come out of it — every session.teamup_event_id was
-- null — so on the day it lapses the forward schedule would simply be gone.
--
-- This is the safety net, and it is deliberately separated from the clever
-- part. These two tables hold Teamup EXACTLY AS IT IS: every event, every
-- sub-calendar, the raw JSON alongside the parsed fields. Once a pull has run,
-- Teamup can expire tomorrow and nothing is lost. Turning those events into
-- sessions, holidays and engagements is a separate decision made afterwards,
-- against data already safely in hand.
--
-- WHY THE RAW JSON IS KEPT. A parser written today against 1,235 events will
-- be wrong about some of them, and the source will be gone by the time anyone
-- notices. `raw` means a better parser can be run later without Teamup.
--
-- WHY NOTHING IS EVER DELETED HERE. A re-pull marks an event that has
-- disappeared from Teamup as `gone_from_teamup` rather than removing the row.
-- If somebody deletes a month by accident at their end, the copy survives.

create table if not exists public.teamup_subcalendar (
  subcalendar_id   bigint primary key,      -- Teamup's own id
  name             text not null,
  events           integer not null default 0,
  first_event      date,
  last_event       date,
  sample_titles    text[],                  -- so a person can recognise it
  -- What this stream IS. Teamup mixes three different things in one list:
  -- course streams (Domestic, LPG, OFTEC), per-person streams (Keith
  -- Assessments, Simon), and non-teaching (Hols / Not Available, On Site).
  -- Here they become sessions, staff attribution, holidays and engagements.
  proposed         text,
  decision         text check (decision is null or decision in
                     ('course','staff','holiday','engagement','ignore')),
  target_course_id bigint references public.course(course_id),
  target_staff_id  bigint references public.assessor(assessor_id),
  decided_by       text,
  decided_at       timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.teamup_event (
  event_id          text primary key,       -- Teamup's own id, so a re-pull updates
  subcalendar_ids   bigint[] not null default '{}',
  title             text,
  start_dt          timestamptz,
  end_dt            timestamptz,
  all_day           boolean not null default false,
  who               text,
  location          text,
  notes             text,
  -- What the title parser made of the house shorthand: "EDINA Re T&A",
  -- "Clarke Energy x 6 + 2", "OFTEC T&A 4 Spaces", "(6)DB-MLP Week 1".
  -- A suggestion to be confirmed, never a silent fact — same rule as the
  -- Access import worklist.
  parsed            jsonb not null default '{}'::jsonb,
  -- Where it ended up once brought across, or null while it is only captured.
  session_id        bigint references public.session(session_id)       on delete set null,
  holiday_id        bigint references public.holiday(holiday_id)       on delete set null,
  engagement_id     bigint references public.engagement(engagement_id) on delete set null,
  brought_across_at timestamptz,
  raw               jsonb,                  -- the whole event, verbatim
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  gone_from_teamup  boolean not null default false
);

create index if not exists teamup_event_start_idx on public.teamup_event (start_dt);
create index if not exists teamup_event_sub_idx   on public.teamup_event using gin (subcalendar_ids);

alter table public.teamup_subcalendar enable row level security;   -- and NO policies
alter table public.teamup_event       enable row level security;
revoke all on table public.teamup_subcalendar from anon, authenticated;
revoke all on table public.teamup_event       from anon, authenticated;

-- ── what an admin can see ───────────────────────────────────────────────────
create or replace function public.app_teamup_subcalendars(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.events desc, s.name), '[]'::jsonb)
    into v_out from teamup_subcalendar s;
  return v_out;
end;
$$;

create or replace function public.app_teamup_stats(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  return (select jsonb_build_object(
    'events',        count(*),
    'brought_across',count(*) filter (where brought_across_at is not null),
    'gone',          count(*) filter (where gone_from_teamup),
    'first',         min(start_dt),
    'last',          max(start_dt),
    'pulled',        max(last_seen)
  ) from teamup_event);
end;
$$;

create or replace function public.app_teamup_map_save(
  p_admin text, p_admin_pw text, p_subcalendar_id bigint,
  p_decision text, p_course_id bigint default null, p_staff_id bigint default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  if p_decision is not null and p_decision not in ('course','staff','holiday','engagement','ignore') then
    raise exception 'Unknown decision';
  end if;
  update teamup_subcalendar
     set decision = p_decision,
         target_course_id = case when p_decision = 'course' then p_course_id else null end,
         target_staff_id  = case when p_decision = 'staff'  then p_staff_id  else null end,
         decided_by = p_admin, decided_at = now(), updated_at = now()
   where subcalendar_id = p_subcalendar_id;
  if not found then raise exception 'No such sub-calendar'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.app_teamup_subcalendars(text, text) from public, anon, authenticated;
revoke all on function public.app_teamup_stats(text, text) from public, anon, authenticated;
revoke all on function public.app_teamup_map_save(text, text, bigint, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.app_teamup_subcalendars(text, text) to anon, authenticated;
grant execute on function public.app_teamup_stats(text, text) to anon, authenticated;
grant execute on function public.app_teamup_map_save(text, text, bigint, text, bigint, bigint) to anon, authenticated;
