-- ── WHERE EVERYONE IS ───────────────────────────────────────────────────────
-- Four of Teamup's sub-calendars are named "Spare" and three of them are in
-- daily use: 116 events reading "Office", 83 reading "SJ Hols", 64 reading
-- "SG Office / Bosch meeting". Alongside them sit "Simon WFH or Short Office
-- Day", "Meeting / Maintenance" and "On Site / Consultancy". Together that is
-- 535 events, and they are all the same question: WHERE IS THIS PERSON TODAY,
-- ON A DAY THEY ARE NOT TEACHING.
--
-- Nobody repurposed those calendars out of carelessness. There was nowhere
-- else to put it, so a spare calendar became the place. Give the thing a home
-- and the Spares stop being needed at all.
--
-- WHAT THE 535 EVENTS DICTATED ABOUT THE SHAPE:
--   * 512 of 535 are ALL DAY. This is a day, not an appointment — which is why
--     start_time/end_time stay optional and are not what this is about.
--   * 133 RUN OVER SEVERAL DAYS (a week off, a week on site), and `engagement`
--     only had start_date. Hence end_date.
--   * Only 15 mention AM or PM — "SJ-Office AM +WFH PM", "SJ-WFH AM / Office
--     PM". Half days are real but rare, so `half` is a plain am/pm and nothing
--     more elaborate.
--
-- HOLIDAYS DELIBERATELY DO NOT LIVE HERE. They already have their own table
-- with a request-and-approve flow behind it. A second way to record time off
-- would mean two answers to "is she in next Tuesday", which is worse than none.

alter table public.engagement
  add column if not exists end_date date,
  add column if not exists half     text,
  add column if not exists kind     text not null default 'other';

-- Existing rows were single days; say so explicitly rather than leaving null
-- to be interpreted differently by whoever reads it next.
update public.engagement set end_date = start_date where end_date is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'engagement_half_ck') then
    alter table public.engagement add constraint engagement_half_ck
      check (half is null or half in ('am','pm'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'engagement_kind_ck') then
    alter table public.engagement add constraint engagement_kind_ck
      check (kind in ('office','wfh','on_site','meeting','training','sick','unavailable','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'engagement_dates_ck') then
    alter table public.engagement add constraint engagement_dates_ck
      check (end_date is null or end_date >= start_date);
  end if;
end $$;

comment on column public.engagement.kind is
  'Where the person is: office | wfh | on_site | meeting | training | sick | unavailable | other. Holidays are NOT here — they live in holiday, which has the approval flow.';
comment on column public.engagement.half is
  'am or pm for a half day; null means the whole day. Rare — 15 of 535 in the Teamup history.';
comment on column public.engagement.end_date is
  'Inclusive last day. Equal to start_date for a single day; a quarter of these run longer.';

-- WHAT BLOCKS TEACHING is decided in one place in the app
-- (src/lib/whereabouts.js) rather than here, so a screen and a check can never
-- disagree about it. The rule Chris set: anything away from the centre blocks
-- somebody being put on a course — WITH ONE EXCEPTION. On site at a customer
-- means they are out doing the work, so they can still be the ASSESSOR; it is
-- teaching at the centre they cannot do.
