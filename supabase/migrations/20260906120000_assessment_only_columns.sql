-- ── assessment-only, written down at last ───────────────────────────────────
-- These two columns have been live since the assessment-only idea was first
-- discussed, but they were applied straight to the database and never captured
-- in a migration. A rebuild from this folder would have come up without them
-- and nothing would have said so. This file is the retrospective record; it is
-- safe to run against the live database, where both columns already exist.
--
-- WHY TWO COLUMNS, AND WHY NOT ONE THREE-WAY CHOICE.
-- `is_reassessment` says WHICH ticket this is — a first sitting or a renewal.
-- `assessment_only` says WHAT THEY BOUGHT — the assessment on its own, without
-- the training days, because they were trained elsewhere or are time-served.
-- They are different questions and every combination of them is real: a brand
-- new candidate can be assessment-only, and a reassessment nearly always is.
-- Folding them into one NEW / RE / ASSESSMENT-ONLY dropdown would force a
-- person to pick between two facts that are both true.
--
-- On `category`, the flag means "this qualification is normally sold this way".
-- On `booking_category`, it means "this delegate, this time" — which is the one
-- the Book screen sets and the one that has to drive price and days attended.

alter table public.category
  add column if not exists assessment_only boolean not null default false;

alter table public.booking_category
  add column if not exists assessment_only boolean not null default false;

comment on column public.category.assessment_only is
  'This qualification is normally sold as an assessment on its own, without training days.';
comment on column public.booking_category.assessment_only is
  'This delegate is attending for the assessment only — trained elsewhere or time-served.';
