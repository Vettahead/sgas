-- ─────────────────────────────────────────────────────────────────────────────
-- Two things the first promotion run got wrong, both visible in the 68 holidays
-- that came out of Teamup with nobody attached to them.
--
-- 1. "BANK HOLIDAY" (36 of them) is not somebody's leave. The centre is shut.
--    It has no person and never will have, so it is not a holiday row at all.
-- 2. "Phil Hols", "Keith - Hols", "Steve Hols", "Sj-HOLS" (28 of them) name the
--    person right there in the title. The pull could not see it because it only
--    matched full first names against the staff list, and the staff list says
--    "Philip Rossall" and "S Johnston" while the calendar says "Phil" and "Sj".
--    So: the words people actually type, as data, the same way the course
--    vocabulary is data. New nickname, new row, no code change.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── the names people actually use ────────────────────────────────────────────
create table if not exists public.teamup_person_hint (
  pattern      text primary key,
  assessor_id  bigint not null references public.assessor(assessor_id) on delete cascade,
  note         text
);
alter table public.teamup_person_hint enable row level security;
revoke all on public.teamup_person_hint from anon, authenticated;

-- Seeded from what the calendar actually says over six years. Surnames only
-- where they are unambiguous: "Gadsdon" is two people, so it is not here.
insert into public.teamup_person_hint (pattern, assessor_id, note) values
  ('phil',          8, 'Philip Rossall'),
  ('philip',        8, 'Philip Rossall'),
  ('rossall',       8, 'Philip Rossall'),
  ('keith',         2, 'Keith Rimmer'),
  ('kr',            2, 'Keith Rimmer — as in KR-Assessments'),
  ('rimmer',        2, 'Keith Rimmer'),
  ('simon',         5, 'Simon Gadsdon — Gadsdon on its own is ambiguous'),
  ('steve',         1, 'S Johnston — the calendar calls him Steve'),
  ('sj',            1, 'S Johnston — as in Sj-HOLS'),
  ('johnston',      1, 'S Johnston'),
  ('denis',         6, 'Denis Brown'),
  ('dennis',        6, 'Denis Brown, spelt the other way'),
  ('jen',           9, 'Jennifer Gadsdon'),
  ('jenny',         9, 'Jennifer Gadsdon'),
  ('jennifer',      9, 'Jennifer Gadsdon'),
  ('callon',       14, 'Callon Fielding'),
  ('fielding',     14, 'Callon Fielding'),
  ('calvert',       3, 'A Calvert'),
  ('nuttall',       4, 'D Nuttall')
on conflict (pattern) do nothing;

-- ── the centre being shut is its own kind of day ─────────────────────────────
update public.teamup_title_hint set means = 'closed' where pattern in ('bank holiday');
insert into public.teamup_title_hint (pattern, means, where_kind) values
  ('easter monday',  'closed', null),
  ('good friday',    'closed', null),
  ('boxing day',     'closed', null),
  ('christmas day',  'closed', null),
  ('new years day',  'closed', null),
  ('new year''s day','closed', null)
on conflict (pattern) do update set means = excluded.means;

alter table public.engagement drop constraint if exists engagement_kind_ck;
alter table public.engagement add constraint engagement_kind_ck check (
  kind = any (array['office','wfh','on_site','meeting','training','sick','unavailable','closed','other'])
);

-- ── who an event is about, whatever kind of event it is ──────────────────────
-- class_assessor_id and class_trainer_id only ever made sense for a course. A
-- holiday has a person too, and so does an audit prep day.
alter table public.teamup_event add column if not exists class_staff_id bigint
  references public.assessor(assessor_id) on delete set null;
