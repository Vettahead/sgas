-- Account emails: a forgotten-password flow that never hands the browser a
-- token, plus the four notes about somebody's login.
--
-- The reset table stores only the HASH of a token. A stolen backup cannot be
-- used to reset anybody's password: the token itself exists in exactly two
-- places, the email and the URL the person clicks.
--
-- app_notify_context gains an account branch (p_ref = user_id) and a {{link}}
-- for every family, taken from app_setting.app_url. NOT from the caller: a
-- reset email whose link comes from whoever asked for it is a phishing kit with
-- extra steps.

insert into public.app_setting (key, value)
values ('app_url', '"https://sgas-opal.vercel.app"'::jsonb)
on conflict (key) do nothing;

create table if not exists public.password_reset (
  reset_id     bigserial primary key,
  user_id      bigint not null references public.app_user(user_id) on delete cascade,
  token_hash   text not null,
  requested_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
create index if not exists password_reset_hash_idx on public.password_reset (token_hash);
create index if not exists password_reset_user_idx on public.password_reset (user_id, requested_at desc);

alter table public.password_reset enable row level security;   -- and NO policies
revoke all on table public.password_reset from anon, authenticated;
revoke all on sequence public.password_reset_reset_id_seq from anon, authenticated;

-- Start a reset. Service_role only: it returns the token, which is the whole
-- secret. Returns a skip reason rather than raising, because the caller must
-- not be able to tell "no such account" from "email sent" — that difference is
-- a list of who works here.
--
-- Username beats email when both match: Chris's admin login IS an email
-- address, and a test reset for somebody else's address landed on his account.
create or replace function public.app_password_reset_start(p_identifier text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  u app_user%rowtype;
  v_email text;
  v_token text;
  v_recent int;
  v_id text := lower(trim(coalesce(p_identifier, '')));
begin
  if v_id = '' then return jsonb_build_object('skip', 'no_account'); end if;

  select * into u from app_user
   where is_active and (lower(username) = v_id or lower(coalesce(email, '')) = v_id)
   order by (lower(username) = v_id) desc, user_id
   limit 1;
  if not found then return jsonb_build_object('skip', 'no_account'); end if;

  select coalesce(nullif(trim(coalesce(u.email, '')), ''),
                  nullif(trim(coalesce(a.email, '')), ''))
    into v_email
    from (select 1) x left join assessor a on a.assessor_id = u.staff_id;
  if v_email is null then return jsonb_build_object('skip', 'no_email'); end if;

  -- One live request per account per five minutes. Without this, a form on a
  -- public page is a way to post somebody a hundred emails.
  select count(*) into v_recent from password_reset
   where user_id = u.user_id and used_at is null and requested_at > now() - interval '5 minutes';
  if v_recent > 0 then return jsonb_build_object('skip', 'recently_sent'); end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into password_reset (user_id, token_hash, expires_at)
  values (u.user_id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '60 minutes');

  return jsonb_build_object(
    'to', v_email, 'name', coalesce(nullif(trim(coalesce(u.name, '')), ''), u.username),
    'username', u.username, 'token', v_token, 'minutes', 60, 'user_id', u.user_id
  );
end;
$$;

-- Finish a reset. The token is the proof; there is no other credential. Using
-- one kills every other outstanding link for that account, so a chain of "I
-- clicked it twice" resets cannot leave a spare key in somebody's inbox.
create or replace function public.app_password_reset_complete(p_token text, p_password text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  r password_reset%rowtype;
  u app_user%rowtype;
begin
  if coalesce(length(p_password), 0) < 8 then
    raise exception 'Choose a password of at least 8 characters';
  end if;

  select * into r from password_reset
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
   order by requested_at desc limit 1;
  if not found then raise exception 'That link is not valid — ask for a new one'; end if;
  if r.used_at is not null then raise exception 'That link has already been used — ask for a new one'; end if;
  if r.expires_at < now() then raise exception 'That link has expired — ask for a new one'; end if;

  select * into u from app_user where user_id = r.user_id;
  if not found or not u.is_active then raise exception 'That account is no longer active'; end if;

  update app_user set password_hash = crypt(p_password, gen_salt('bf')) where user_id = u.user_id;
  update password_reset set used_at = now() where reset_id = r.reset_id;
  update password_reset set used_at = now()
   where user_id = u.user_id and used_at is null;

  return jsonb_build_object('user_id', u.user_id, 'username', u.username);
end;
$$;

-- The template on its own, for the one email whose contents cannot come from a
-- row: a reset carries a token that is deliberately not stored in readable form.
create or replace function public.app_template_for_send(p_key text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare t email_template%rowtype;
begin
  select * into t from email_template where key = p_key;
  if not found then return jsonb_build_object('skip', 'unknown_kind'); end if;
  if not t.enabled then return jsonb_build_object('skip', 'template_off'); end if;
  return jsonb_build_object(
    'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox),
    'app_url', coalesce((select value #>> '{}' from app_setting where key = 'app_url'), '')
  );
end;
$$;

revoke all on function public.app_password_reset_start(text) from public, anon, authenticated;
revoke all on function public.app_password_reset_complete(text, text) from public, anon, authenticated;
revoke all on function public.app_template_for_send(text) from public, anon, authenticated;
grant execute on function public.app_password_reset_start(text) to service_role;
grant execute on function public.app_password_reset_complete(text, text) to service_role;
grant execute on function public.app_template_for_send(text) to service_role;

-- ── the context function, now covering account emails too ───────────────────
create or replace function public.app_notify_context(
  p_kind text, p_ref bigint, p_staff_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  t email_template%rowtype;
  s record;
  h record;
  u record;
  v_staff record;
  v_count integer;
  v_days integer;
  v_to text;
  v_appr_id bigint;
  v_appr_name text;
  v_appr_email text;
  v_url text;
begin
  select * into t from email_template where key = p_kind;
  if not found then return jsonb_build_object('skip', 'unknown_kind'); end if;
  if not t.enabled then return jsonb_build_object('skip', 'template_off'); end if;

  select coalesce(value #>> '{}', '') into v_url from app_setting where key = 'app_url';

  -- ── course emails ────────────────────────────────────────────────────────
  if p_kind in ('trainer_assigned','trainer_removed','course_moved') then
    select ses.session_id, ses.start_date, ses.end_date, ses.trainer_id, c.name as course_name
      into s
      from session ses left join course c on c.course_id = ses.course_id
     where ses.session_id = p_ref;
    if not found then return jsonb_build_object('skip', 'no_session'); end if;

    if p_kind = 'trainer_removed' then
      if p_staff_id is null then return jsonb_build_object('skip', 'no_staff'); end if;
      select * into v_staff from assessor where assessor_id = p_staff_id;
    else
      if s.trainer_id is null then return jsonb_build_object('skip', 'no_trainer'); end if;
      select * into v_staff from assessor where assessor_id = s.trainer_id;
    end if;
    if not found then return jsonb_build_object('skip', 'no_staff'); end if;
    if coalesce(trim(v_staff.email), '') = '' then
      return jsonb_build_object('skip', 'no_email', 'name', v_staff.name);
    end if;

    select count(*) into v_count from booking where session_id = s.session_id;

    return jsonb_build_object(
      'to', v_staff.email, 'trainer', v_staff.name,
      'course', coalesce(s.course_name, 'a course'),
      'start', s.start_date, 'end', s.end_date,
      'room', nullif(trim(coalesce(v_staff.assigned_room, '')), ''),
      'delegates', v_count, 'link', v_url,
      'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
    );
  end if;

  -- ── holiday emails ───────────────────────────────────────────────────────
  if p_kind in ('holiday_requested','holiday_approved','holiday_rejected') then
    select * into h from holiday where holiday_id = p_ref;
    if not found then return jsonb_build_object('skip', 'no_holiday'); end if;

    select * into v_staff from assessor where assessor_id = h.staff_id;
    if not found then return jsonb_build_object('skip', 'no_staff'); end if;

    -- Whoever approves: the named person if one is set and reachable,
    -- otherwise the first active admin with an email on their staff record.
    select nullif(value, 'null'::jsonb)::text::bigint into v_appr_id
      from app_setting where key = 'holiday_approver_staff_id';

    if v_appr_id is not null then
      select a.name, nullif(trim(coalesce(a.email, '')), '')
        into v_appr_name, v_appr_email
        from assessor a where a.assessor_id = v_appr_id;
    end if;

    if v_appr_email is null then
      select a.name, nullif(trim(coalesce(a.email, '')), '')
        into v_appr_name, v_appr_email
        from app_user u join assessor a on a.assessor_id = u.staff_id
       where u.role = 'ADMIN' and u.is_active and coalesce(trim(a.email), '') <> ''
       order by u.user_id limit 1;
    end if;

    -- Working days, which is how the rest of the app counts holiday.
    select count(*) into v_days
      from generate_series(h.start_date, h.end_date, interval '1 day') d
     where extract(isodow from d) < 6;

    if p_kind = 'holiday_requested' then
      v_to := v_appr_email;
      -- Nobody chases themselves: if the approver booked it, there is nothing
      -- to approve and nothing to send.
      if v_appr_id is not null and v_appr_id = h.staff_id then
        return jsonb_build_object('skip', 'approver_is_the_requester');
      end if;
    else
      v_to := nullif(trim(coalesce(v_staff.email, '')), '');
    end if;
    if v_to is null then return jsonb_build_object('skip', 'no_email'); end if;

    return jsonb_build_object(
      'to', v_to,
      'staff', v_staff.name,
      'approver', coalesce(v_appr_name, 'the office'),
      'start', h.start_date, 'end', h.end_date,
      'working_days', v_days, 'link', v_url,
      'note', nullif(trim(coalesce(h.note, '')), ''),
      'reason', nullif(trim(coalesce(h.decision_note, '')), ''),
      'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
    );
  end if;

  -- ── account emails ───────────────────────────────────────────────────────
  -- p_ref is the login's user_id. Reachable at the address on the account, or
  -- the one on their staff record if the account has none.
  if p_kind in ('password_changed','user_created','account_disabled','account_enabled') then
    select au.user_id, au.username, au.name, au.role, au.email,
           coalesce(nullif(trim(coalesce(au.email, '')), ''), nullif(trim(coalesce(a.email, '')), '')) as reach,
           coalesce(nullif(trim(coalesce(au.name, '')), ''), au.username) as display
      into u
      from app_user au left join assessor a on a.assessor_id = au.staff_id
     where au.user_id = p_ref;
    if not found then return jsonb_build_object('skip', 'no_account'); end if;
    if u.reach is null then return jsonb_build_object('skip', 'no_email', 'name', u.display); end if;

    return jsonb_build_object(
      'to', u.reach, 'name', u.display, 'username', u.username,
      'role', case u.role when 'ADMIN' then 'Admin' when 'STANDARD' then 'Standard'
                          when 'SCHEDULER' then 'Scheduler' when 'ASSESSOR' then 'Assessor'
                          when 'ACCOUNTS' then 'Accounts' else u.role end,
      'link', v_url,
      'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
    );
  end if;

  return jsonb_build_object('skip', 'unknown_kind');
end;
$$;

revoke all on function public.app_notify_context(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.app_notify_context(text, bigint, bigint) to service_role;

-- ── the account emails themselves ───────────────────────────────────────────
-- Defaults only. Every one of these is editable in Admin → Email → Wording, so
-- on conflict do nothing: this must never overwrite a change Chris has made.
insert into public.email_template (key, name, description, mailbox, subject, body, tokens) values
(
  'password_reset',
  'Forgotten password',
  'Sent when somebody asks for a password reset from the sign-in screen.',
  'crm',
  'Reset your SGAS password',
  $tpl$Hello {{name}},

Somebody asked to reset the password for {{username}}. If that was you, open
this link and choose a new one:

{{link}}

The link works once and stops working after {{expires}}.

If it was not you, ignore this email — nothing has changed and the link cannot
be used without opening it.

SGAS Training Management$tpl$,
  array['name','username','link','expires']
),
(
  'password_changed',
  'Password changed',
  'Sent whenever a password is changed — by the person themselves, or by an admin resetting it.',
  'crm',
  'Your SGAS password has been changed',
  $tpl$Hello {{name}},

The password for {{username}} has just been changed.

If that was you, there is nothing to do.

If it was not, tell the office straight away — somebody else has access to your
account.

SGAS Training Management$tpl$,
  array['name','username','link']
),
(
  'user_created',
  'New login created',
  'Sent to somebody when an account is created for them. The password is not emailed — you hand that over yourself.',
  'crm',
  'Your SGAS Training Management login',
  $tpl$Hello {{name}},

An account has been set up for you on the SGAS training system.

  Sign in at:  {{link}}
  Username:    {{username}}
  Your access: {{role}}

Whoever set it up will give you your password separately. Change it once you are
in.

SGAS Training Management$tpl$,
  array['name','username','link','role']
),
(
  'account_disabled',
  'Account switched off',
  'Sent when a login is disabled.',
  'crm',
  'Your SGAS login has been switched off',
  $tpl$Hello {{name}},

The login {{username}} has been switched off, so it will no longer sign in.

Nothing you have done on the system has been removed. If you think this is a
mistake, speak to the office.

SGAS Training Management$tpl$,
  array['name','username','link']
),
(
  'account_enabled',
  'Account switched back on',
  'Sent when a disabled login is re-enabled.',
  'crm',
  'Your SGAS login is active again',
  $tpl$Hello {{name}},

The login {{username}} is active again — you can sign in at {{link}}.

If you cannot remember the password, use "Forgotten your password?" on the sign-in
screen.

SGAS Training Management$tpl$,
  array['name','username','link']
)
on conflict (key) do nothing;
