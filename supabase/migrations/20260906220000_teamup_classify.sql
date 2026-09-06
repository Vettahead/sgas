-- ── WHAT EACH TEAMUP EVENT ACTUALLY IS ──────────────────────────────────────
-- The first attempt asked a person to say what each of the 25 sub-calendars
-- was. Chris killed it, correctly: "you're assuming they're split by courses
-- and they aren't... that's a lot of lifting for me to do, can we not automate
-- it?" One calendar holds "PQ Corp ACOP 16", an on-site job at Somerford and
-- "KR-General". The Hols calendar holds "LCL Audit Prep", which is work.
--
-- Measured across 1,235 events: 0% is classifiable per calendar, 85% per event.
--
-- SO THE CALENDAR IS A HINT ABOUT **WHO**, NEVER A STATEMENT ABOUT WHAT.
-- Every event is classified on its own evidence, the reason is stored in words
-- next to it, and a person corrects the few that look wrong afterwards.
-- Nothing is asked up front.
--
-- Three sources for the course, in order of how much they actually know:
--   1. the TITLE            — names it outright
--   2. the CANDIDATES field — the qualifications listed resolve to a scheme
--   3. "Assessment day"     — the real, permanent course for a mixed day
--
-- And the role is NOT a property of the calendar: T&A means they trained AND
-- assessed, which no single dropdown could ever say. It comes from the event.

alter table public.teamup_event
  add column if not exists class_kind        text,
  add column if not exists class_where       text,
  add column if not exists class_course_id   bigint references public.course(course_id),
  add column if not exists class_course_from text,
  add column if not exists class_on_site     boolean not null default false,
  add column if not exists class_trainer_id  bigint references public.assessor(assessor_id),
  add column if not exists class_assessor_id bigint references public.assessor(assessor_id),
  add column if not exists class_ta          boolean not null default false,
  add column if not exists class_review      boolean not null default false,
  add column if not exists class_why         text,
  add column if not exists classified_at     timestamptz,
  add column if not exists class_override    boolean not null default false;

comment on column public.teamup_event.class_override is
  'A person corrected this one. Re-classifying never touches an overridden row.';
comment on column public.teamup_event.class_why is
  'Why it was classified this way, in words, so the answer can be argued with.';

-- ── their vocabulary ────────────────────────────────────────────────────────
-- A TABLE, not a regex buried in code, because Chris said the setup is messy
-- and they will tidy it over time: a new spelling should be one row, not a
-- deployment. NULL scheme means the pattern says "this is not a course".
create table if not exists public.teamup_title_hint (
  pattern    text primary key,
  scheme     text,
  means      text not null,     -- course | holiday | whereabouts | engagement | on_site
  where_kind text,
  note       text
);
alter table public.teamup_title_hint enable row level security;   -- and NO policies
revoke all on table public.teamup_title_hint from anon, authenticated;

insert into public.teamup_title_hint (pattern, scheme, means, where_kind, note) values
  ('commercial','ACS Commercial','course',null,null), ('comm','ACS Commercial','course',null,null),
  ('com','ACS Commercial','course',null,null),        ('cocn','ACS Commercial','course',null,null),
  ('cgfe','ACS Commercial','course',null,null),       ('icpn','ACS Commercial','course',null,null),
  ('ccn','ACS Domestic','course',null,null),          ('cen','ACS Domestic','course',null,null),
  ('htr','ACS Domestic','course',null,null),          ('ckr','ACS Domestic','course',null,null),
  ('dah','ACS Domestic','course',null,null),          ('domestic','ACS Domestic','course',null,null),
  ('igas','IGAS','course',null,null),                 ('i-gas','IGAS','course',null,null),
  ('oos','IGAS','course',null,null),                  ('mlp','IGAS','course',null,null),
  ('oftec','OFTEC','course',null,null),               ('lpg','LPG','course',null,null),
  ('conglp','LPG','course',null,null),                ('veslp','LPG','course',null,null),
  ('f-gas','F-gas','course',null,null),               ('fgas','F-gas','course',null,null),
  ('met','Meters','course',null,null),                ('regt','Meters','course',null,null),
  ('gl8','Meters','course',null,null),                ('cmdda','Meters','course',null,null),
  ('heat pump','Renewables','course',null,null),      ('heat pumps','Renewables','course',null,null),
  ('renewables','Renewables','course',null,null),     ('solar','Renewables','course',null,null),
  ('green skills bootcamp','Renewables','course',null,null),
  ('acop','SGAS courses','course',null,null),         ('agw','SGAS courses','course',null,null),
  ('gsm','SGAS courses','course',null,null),          ('wras','Water','course',null,null),
  ('hwss','Water','course',null,null),                ('catering','Catering','course',null,null),
  ('laundry','Laundry','course',null,null),           ('18th','Electrical','course',null,null),
  -- not courses. "LCL Audit Prep" sits on the Hols calendar and is WORK, which
  -- is exactly why the event decides and the calendar does not.
  ('bank holiday',null,'holiday',null,null), ('holiday',null,'holiday',null,null),
  ('hols',null,'holiday',null,null),         ('annual leave',null,'holiday',null,null),
  ('off',null,'holiday',null,'bare "off" / "SJ-Off"'),
  ('sick',null,'whereabouts','sick',null),   ('wfh',null,'whereabouts','wfh',null),
  ('office',null,'whereabouts','office',null),
  ('dentist',null,'whereabouts','unavailable',null),
  ('prep',null,'whereabouts','training','audit prep, course prep — work, not time off'),
  ('audit',null,'whereabouts','training',null),
  ('meeting',null,'engagement',null,null),   ('maintenance',null,'engagement',null,null),
  ('visit',null,'engagement',null,null),
  ('on site',null,'on_site',null,null),      ('onsite',null,'on_site',null,null),
  ('on-site',null,'on_site',null,null),      ('consultancy',null,'on_site',null,null)
on conflict (pattern) do nothing;

-- The permanent catch-all course. NOT called "historic": Chris's point is that
-- mixed assessment days are normal operation — 1,070 of 1,771 past days were
-- mixed — so this is equally correct for a day booked next week.
insert into public.course (name, scheme, color, is_active)
select 'Assessment day', 'SGAS courses', '#7a8699', true
 where not exists (select 1 from public.course where name = 'Assessment day');
