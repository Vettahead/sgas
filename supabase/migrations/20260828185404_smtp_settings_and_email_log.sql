-- Email plumbing: where the SMTP settings live, and a record of every send.
--
-- The passwords do NOT live in a column. They go into Supabase Vault, which
-- encrypts them with a key held outside the database; the tables only keep the
-- secret's id. Nothing here is reachable with the public anon key: both tables
-- have RLS on with NO policies, exactly like app_user, so the only way in is
-- through the SECURITY DEFINER functions in the next migration, which check the
-- caller is an admin using the same app_is_admin() the user admin screen uses.

create table if not exists public.smtp_setting (
  id          boolean primary key default true check (id),   -- single row
  host        text    not null default 'smtp.sgas.co.uk',
  port        integer not null default 465,
  secure      boolean not null default true,                 -- 465 = TLS on connect
  updated_at  timestamptz not null default now()
);

create table if not exists public.smtp_mailbox (
  key         text primary key check (key in ('crm','holidays','bookings')),
  address     text not null,          -- the From: address
  username    text not null,          -- usually the same as the address
  from_name   text,                   -- display name on the From: header
  secret_id   uuid,                   -- -> vault.secrets(id); null = no password yet
  updated_at  timestamptz not null default now()
);

-- Every attempt, so "did Simon actually get the expiry warning?" is answerable.
create table if not exists public.email_log (
  id          bigserial primary key,
  sent_at     timestamptz not null default now(),
  mailbox     text,
  to_address  text not null,
  subject     text,
  kind        text,                   -- 'test' | 'trainer_assigned' | 'expiry' | ...
  ok          boolean not null,
  error       text,                   -- what the mail server said, when it refused
  ref_id      text
);
create index if not exists email_log_sent_at_idx on public.email_log (sent_at desc);

alter table public.smtp_setting enable row level security;
alter table public.smtp_mailbox enable row level security;
alter table public.email_log    enable row level security;
-- Deliberately no policies: the anon key must never reach these directly.

insert into public.smtp_setting (id) values (true) on conflict (id) do nothing;

insert into public.smtp_mailbox (key, address, username, from_name) values
  ('crm',      'crm@sgas.co.uk',      'crm@sgas.co.uk',      'SGAS'),
  ('holidays', 'holidays@sgas.co.uk', 'holidays@sgas.co.uk', 'SGAS Holidays'),
  ('bookings', 'bookings@sgas.co.uk', 'bookings@sgas.co.uk', 'SGAS Bookings')
on conflict (key) do nothing;
