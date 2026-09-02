-- ─────────────────────────────────────────────────────────────────────────────
-- Sage, Phase 1: READ ONLY.
--
-- Jen's answer to the proposal (01 Sep 2026) was "stay with phase 1". So this
-- migration sets up everything needed to READ from Sage Business Cloud
-- Accounting v3.1 and nothing whatsoever to write to it. There is no table
-- here that holds a draft invoice, because nothing is ever sent.
--
-- THE PROMISE WE MADE HER, and how it is kept in three places:
--   1. the OAuth scope requested is 'readonly', so Sage itself refuses a write
--      even if our code asked for one;
--   2. no function here composes anything that could be POSTed;
--   3. the edge function has no write path (see supabase/functions/sage-read).
-- Breaking any one of those should feel like breaking a promise, because it is.
--
-- SECRETS follow the SMTP pattern exactly (20260828185404 / 185442): the values
-- live in Supabase Vault, the tables keep only the secret's id, both tables have
-- RLS on with NO policies, and the only ways in are SECURITY DEFINER functions —
-- admin-checked ones for the Admin screen, service_role-only ones for the edge
-- function. The anon key every browser holds can reach none of it.
--
-- WHY TOKENS ARE HANDLED SO CAREFULLY HERE: Sage access tokens last about five
-- minutes and refresh tokens are SINGLE USE — every refresh invalidates the old
-- one and issues a new one. That has two consequences worth stating out loud:
--   * the rotated refresh token MUST be written back immediately or the
--     connection is dead and someone has to sign in again;
--   * a refresh token also expires after ~31 days of inactivity, so the
--     scheduled pull is not only about fresh data, it is what keeps the
--     connection alive at all.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The connection itself ────────────────────────────────────────────────────
-- One row. SGAS talks to exactly one Sage business.
create table if not exists public.sage_connection (
  id                  boolean primary key default true check (id),

  -- Which Sage business. Comes from GET /businesses after the first sign-in and
  -- is then sent as the X-Business header on every single request.
  business_id         text,
  business_name       text,

  -- The registered developer app. The id is not secret; the secret is.
  client_id           text,
  client_secret_id    uuid,          -- -> vault.secrets(id)

  -- The tokens. Never columns, always Vault.
  access_secret_id    uuid,          -- -> vault.secrets(id)
  refresh_secret_id   uuid,          -- -> vault.secrets(id)
  access_expires_at   timestamptz,   -- ~5 minutes after issue
  refresh_expires_at  timestamptz,   -- ~31 days, reset on every use

  -- What we asked Sage for. Phase 1 must always read 'readonly'.
  scope               text not null default 'readonly',

  -- Provenance, so "who connected this and when" is answerable a year from now.
  connected_at        timestamptz,
  connected_by        text,

  -- Health, for the Admin screen. A connection that silently stopped working is
  -- worse than one that never worked, so the last failure is kept verbatim.
  last_sync_at        timestamptz,
  last_sync_ok        boolean,
  last_sync_error     text,

  updated_at          timestamptz not null default now()
);

-- ── The invoice cache ────────────────────────────────────────────────────────
-- A local copy of what Sage said, so the screens stay quick. It is a CACHE and
-- is named like one: nothing in SGAS may treat a row here as the truth about
-- money. Sage owns money. This says what Sage last told us, and when.
create table if not exists public.sage_invoice (
  sage_id             text primary key,        -- Sage's own invoice id
  invoice_number      text,
  reference           text,                    -- free-text field on the invoice
  contact_sage_id     text,
  contact_name        text,                    -- denormalised, for the match screen
  invoice_date        date,
  due_date            date,
  total_amount        numeric(12,2),
  outstanding_amount  numeric(12,2),           -- 0 = paid; < total = part paid
  currency            text,
  sage_status         text,                    -- whatever Sage calls it

  -- THE JOIN. Phase 1 never creates the invoice, so nothing links it to a
  -- booking on its own — this column is the whole matching problem in one place.
  booking_id          bigint references public.booking(booking_id) on delete set null,
  match_state         text not null default 'unmatched'
                      check (match_state in ('unmatched','auto','manual','ignored')),
  match_confidence    numeric(4,3),            -- what the auto-matcher scored it
  match_note          text,
  matched_at          timestamptz,
  matched_by          text,

  fetched_at          timestamptz not null default now()
);

create index if not exists sage_invoice_booking_idx  on public.sage_invoice (booking_id);
create index if not exists sage_invoice_contact_idx  on public.sage_invoice (contact_sage_id);
create index if not exists sage_invoice_unmatched_idx on public.sage_invoice (match_state)
  where match_state = 'unmatched';

-- ── The payment cache on the booking ─────────────────────────────────────────
-- flag_payment_outstanding already exists and people tick it by hand today.
-- It is NOT dropped: until Sage is live and matched, the hand-set value is all
-- there is. What changes is that we now record where a value came from, so that
-- when Sage arrives the hand-set rows can be reconciled rather than blindly
-- overwritten.
alter table public.booking
  add column if not exists payment_total_amount       numeric(12,2),
  add column if not exists payment_outstanding_amount numeric(12,2),
  add column if not exists payment_state              text
      check (payment_state in ('paid','part_paid','unpaid')),
  add column if not exists payment_checked_at         timestamptz,
  add column if not exists payment_source             text
      check (payment_source in ('sage','manual')),
  add column if not exists payment_set_by             text;

comment on column public.booking.payment_checked_at is
  'When Sage was last asked. Shown on screen: a number with no timestamp will '
  'eventually pass itself off as more up to date than it really is.';
comment on column public.booking.payment_source is
  'sage = read from Sage. manual = somebody ticked it. Never overwrite a manual '
  'row without recording that you did.';

alter table public.sage_connection enable row level security;
alter table public.sage_invoice    enable row level security;
-- Deliberately no policies, exactly like smtp_setting: the anon key must never
-- reach either table directly. Everything goes through the functions below.

insert into public.sage_connection (id) values (true) on conflict (id) do nothing;
