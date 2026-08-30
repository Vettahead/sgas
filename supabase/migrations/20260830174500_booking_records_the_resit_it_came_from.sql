-- APPLIED to vyabbdxsatvcmwkuircm on 30 Aug 2026. Mirrored here for the record.
--
-- A re-sit used to lose its own history the moment it was booked.
--
-- rescheduleDelegate() creates a NEW booking for the qualifications somebody did
-- not pass. The OLD booking keeps disposition (NYC / NO_SHOW) and gets
-- rescheduled = true, so the loop-back list stops offering them. But nothing on
-- the NEW booking said where it came from, so once it was on a course the person
-- read as an ordinary new delegate — green, "New" — and the amber or red that
-- says "this is a re-sit" was gone from the calendar entirely.
--
-- Two columns, because they answer two different questions:
--   resat_from  the truthful link back to the booking this one replaces. This is
--               the audit answer: which sitting is this a second attempt at.
--   resat_kind  the ORIGINAL disposition, copied at the moment of re-booking.
--               Denormalised on purpose. It is a historical fact that can never
--               change afterwards, and it means every screen can colour a re-sit
--               without a join back through a self-referencing foreign key on
--               every single listing of a course.
alter table public.booking
  add column if not exists resat_from bigint references public.booking(booking_id),
  add column if not exists resat_kind text;

alter table public.booking
  drop constraint if exists booking_resat_kind_check;
alter table public.booking
  add constraint booking_resat_kind_check
  check (resat_kind is null or resat_kind in ('NYC', 'NO_SHOW'));

create index if not exists booking_resat_from_idx
  on public.booking (resat_from) where resat_from is not null;

comment on column public.booking.resat_from is
  'The booking this one re-sits, set by rescheduleDelegate(). The earlier booking keeps its disposition and rescheduled=true; this is the forward link.';
comment on column public.booking.resat_kind is
  'The earlier booking''s disposition (NYC / NO_SHOW) copied at the moment of re-booking, so a re-sit can be coloured as one without a join.';
