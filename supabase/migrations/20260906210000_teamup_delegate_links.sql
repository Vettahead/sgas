-- ── WHO WAS ON WHICH TEAMUP EVENT ───────────────────────────────────────────
-- SGAS renamed Teamup's built-in NOTES field to "Candidates" (confirmed from
-- /configuration: builtin_notes carries the name "Candidates", builtin_location
-- carries "Room"; the only genuine custom field is a test one on a single
-- event). So that field is not incidental scribble — it is a delegate list, and
-- its content is intended to be one.
--
-- This table joins those names to the 3,164 delegates imported from Access.
--
-- WHY A TABLE AND NOT A ONE-OFF UPDATE. It answers two different questions and
-- both will be read: "who goes on this historic calendar block" (the backfill)
-- and "was this an initial or a re-sit" (the flag Access never recorded). An
-- update would answer one and throw the other away.
--
-- CONFIDENCE IS STORED, NOT ASSUMED. A name alone is not enough — 134 names in
-- the delegate list belong to more than one person. Strength = how many
-- independent things agree:
--   certain : name + date + qualification. The person, the day and the exact
--             ticket they took all line up.               880 links, 444 people
--   likely  : name + date.                                            40 links
--   weak    : name only. A mention, never acted on.                  409 links
-- Only 'certain' links are used to change a booking, and only where the name
-- belongs to exactly one delegate — 62 certain links sit on a shared name and
-- are held back, because "almost certainly right" is not a reason to write to
-- somebody's training record unasked.
create table if not exists public.teamup_event_delegate (
  event_id     text   not null references public.teamup_event(event_id) on delete cascade,
  client_id    bigint not null references public.client(client_id) on delete cascade,
  noted_name   text   not null,          -- exactly as written in Candidates
  quals        text[] not null default '{}',
  noted_kind   text,                     -- reassessment | initial | null
  booking_id   bigint references public.booking(booking_id) on delete set null,
  confidence   text   not null check (confidence in ('certain','likely','weak')),
  name_shared  boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (event_id, client_id, noted_name)
);

create index if not exists teamup_event_delegate_client_idx  on public.teamup_event_delegate (client_id);
create index if not exists teamup_event_delegate_booking_idx on public.teamup_event_delegate (booking_id);

alter table public.teamup_event_delegate enable row level security;   -- and NO policies
revoke all on table public.teamup_event_delegate from anon, authenticated;

comment on table public.teamup_event_delegate is
  'Delegates named in a Teamup event''s Candidates field, matched to imported delegates. confidence=certain means name, date and qualification all agree.';

-- The rows themselves are built by a query over teamup_event.parsed->>delegates
-- and are not repeated here: they are derived from a pull, and re-running this
-- migration on a fresh database should not invent them.
