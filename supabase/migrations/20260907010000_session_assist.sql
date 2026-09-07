-- ASSIST — the fourth role on a course.
--
-- A course already carries a trainer, an assessor and a verifier, one each,
-- for the whole block. Assisting is none of those three things: Keith runs the
-- week, Phil comes in for two days of it. So it needs its own table — a role
-- column could not hold more than one person, and could not hold "days 3 to 4".
--
-- Until now the only trace of it was a Teamup title: 20260907000200 taught the
-- parser that "SG Assist" is work rather than time off, and it lands as a
-- whereabouts entry of kind 'other' that blocks nothing and is attached to no
-- course. That was the best a free-text calendar could do. This is the record
-- the calendar could not keep.
--
-- WHY DATES AND NOT A FLAG: the days are the point. An assistant on days 3-4
-- is free on days 1-2, and the clash check is worthless if it cannot tell.
create table if not exists public.session_assist (
  session_assist_id bigserial primary key,
  session_id  bigint not null references public.session(session_id)  on delete cascade,
  staff_id    bigint not null references public.assessor(assessor_id) on delete restrict,
  from_date   date not null,
  to_date     date not null,
  note        text,
  created_at  timestamptz not null default now(),
  constraint session_assist_dates check (to_date >= from_date),
  -- The same person twice on the same course from the same day is a double
  -- click, not two facts. Two DIFFERENT stretches on one course are allowed:
  -- somebody in on Monday and again on Thursday is a real thing.
  constraint session_assist_once unique (session_id, staff_id, from_date)
);

create index if not exists session_assist_session_idx on public.session_assist (session_id);
create index if not exists session_assist_staff_idx   on public.session_assist (staff_id, from_date, to_date);

alter table public.session_assist enable row level security;

-- Same shape as session / engagement / holiday: signed in, then the app's own
-- role rules decide what may be changed. Do not invent a second pattern here.
drop policy if exists p_signed_in_all on public.session_assist;
create policy p_signed_in_all on public.session_assist
  for all to authenticated
  using (app_is_signed_in()) with check (app_is_signed_in());

grant select, insert, update, delete on public.session_assist to authenticated;
grant usage, select on sequence public.session_assist_session_assist_id_seq to authenticated;
