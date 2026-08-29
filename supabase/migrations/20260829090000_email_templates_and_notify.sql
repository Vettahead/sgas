-- ─────────────────────────────────────────────────────────────────────────────
-- Editable email templates, and the narrow path that lets the app fire a
-- notification without holding anybody's password.
--
-- WHY A SEPARATE PATH. Every existing email RPC takes admin credentials,
-- because the Admin screen has them to hand. A trainer notification does not:
-- it fires the moment somebody drags a name onto a course, and that somebody
-- may be a scheduler whose password the browser never keeps (app_login checks
-- it in the database and returns a sanitised row -- the password is gone by the
-- time the calendar loads).
--
-- So the app cannot say "send this text to this address". It can only say
-- "session 42 just had a trainer put on it". Everything else -- who the
-- recipient is, what the wording is, whether it is switched on at all -- is
-- decided here, from the database. The worst an anon caller can do with the
-- notify path is make a real trainer receive a true statement about a real
-- course, at most once per ten minutes.
--
-- The two functions at the bottom are service_role ONLY. Note that
-- "revoke ... from public" does NOT cover anon and authenticated on Supabase --
-- they are granted EXECUTE directly by default -- so they are named explicitly,
-- and supabase/README.md carries the check that proves it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── the templates ────────────────────────────────────────────────────────────
create table if not exists public.email_template (
  key         text primary key,
  name        text not null,               -- what Admin calls it
  description text,                        -- when it fires, in plain English
  mailbox     text not null default 'crm',
  subject     text not null,
  body        text not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.email_template enable row level security;   -- and NO policies
revoke all on table public.email_template from anon, authenticated;

-- Seeded once. Later edits are Chris's, so this must never overwrite them:
-- on conflict do nothing.
insert into public.email_template (key, name, description, mailbox, subject, body) values
(
  'trainer_assigned',
  'Trainer put on a course',
  'Sent to a trainer when they are put on a course.',
  'crm',
  'You are on {{course}}, {{dates}}',
  $tpl$Hello {{trainer}},

You have been put on {{course}}.

  When:   {{dates}} ({{days}})
  Where:  {{room}}
  Booked: {{delegates}}

The number booked can still change. The system holds the up-to-date position.

SGAS Training Management$tpl$
),
(
  'trainer_removed',
  'Trainer taken off a course',
  'Sent to a trainer when they are taken off a course, including when somebody else is put on in their place.',
  'crm',
  'You are no longer on {{course}}, {{dates}}',
  $tpl$Hello {{trainer}},

You have been taken off {{course}} on {{dates}}.

Nothing further is needed from you. If that looks wrong, let the office know.

SGAS Training Management$tpl$
),
(
  'course_moved',
  'Course dates changed',
  'Sent to the trainer already on a course when its dates are changed.',
  'crm',
  '{{course}} has moved to {{dates}}',
  $tpl$Hello {{trainer}},

{{course}}, which you are down to run, has been moved.

  Was:    {{old_dates}}
  Now:    {{dates}} ({{days}})
  Where:  {{room}}
  Booked: {{delegates}}

SGAS Training Management$tpl$
)
on conflict (key) do nothing;

-- ── Admin: read and edit the wording ─────────────────────────────────────────
create or replace function public.app_email_templates(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', t.key, 'name', t.name, 'description', t.description,
           'mailbox', t.mailbox, 'subject', t.subject, 'body', t.body,
           'enabled', t.enabled, 'updated_at', t.updated_at
         ) order by t.key), '[]'::jsonb)
    into v_out from email_template t;
  return v_out;
end;
$$;

create or replace function public.app_email_template_save(
  p_admin text, p_admin_pw text,
  p_key text, p_subject text, p_body text, p_enabled boolean, p_mailbox text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  if p_mailbox is not null and p_mailbox not in ('crm','holidays','bookings') then
    raise exception 'Unknown mailbox';
  end if;
  -- A blank subject or body would send an empty email rather than fail loudly.
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'The subject and the message cannot be empty';
  end if;

  update email_template
     set subject = p_subject,
         body    = p_body,
         enabled = coalesce(p_enabled, enabled),
         mailbox = coalesce(nullif(trim(p_mailbox), ''), mailbox),
         updated_at = now()
   where key = p_key;
  if not found then raise exception 'No such template'; end if;

  return app_email_templates(p_admin, p_admin_pw);
end;
$$;

-- ── the notify path (service_role only, called by the Edge Function) ─────────
-- Everything the function needs to compose one notification, in one call:
-- the template, the recipient, and the facts. Returns {"skip": reason} rather
-- than raising, so a switched-off template or a trainer with no email address
-- is an ordinary outcome and not an error on somebody's screen.
create or replace function public.app_notify_context(
  p_kind text, p_session_id bigint, p_staff_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  t email_template%rowtype;
  s record;
  v_staff record;
  v_count integer;
begin
  select * into t from email_template where key = p_kind;
  if not found then return jsonb_build_object('skip', 'unknown_kind'); end if;
  if not t.enabled then return jsonb_build_object('skip', 'template_off'); end if;

  select ses.session_id, ses.start_date, ses.end_date, ses.trainer_id, c.name as course_name
    into s
    from session ses left join course c on c.course_id = ses.course_id
   where ses.session_id = p_session_id;
  if not found then return jsonb_build_object('skip', 'no_session'); end if;

  -- Who to tell. For a removal the person is no longer on the session, so the
  -- caller names them; for everything else the session itself is the authority
  -- and a caller-supplied id is ignored.
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
    'to',        v_staff.email,
    'trainer',   v_staff.name,
    'course',    coalesce(s.course_name, 'a course'),
    'start',     s.start_date,
    'end',       s.end_date,
    'room',      nullif(trim(coalesce(v_staff.assigned_room, '')), ''),
    'delegates', v_count,
    'template',  jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
  );
end;
$$;

-- Was this exact notification already sent a moment ago? Dragging a course
-- about produces a burst of identical updates, and a trainer should not get
-- five emails because somebody nudged a bar. The subject carries the dates, so
-- a genuine SECOND move -- to different dates -- has a different subject and
-- still goes out.
create or replace function public.app_email_recent(
  p_kind text, p_ref text, p_to text, p_subject text, p_minutes integer default 10
) returns boolean
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  select exists (
    select 1 from email_log
     where kind = p_kind
       and coalesce(ref_id, '') = coalesce(p_ref, '')
       and to_address = p_to
       and coalesce(subject, '') = coalesce(p_subject, '')
       and ok
       and sent_at > now() - make_interval(mins => greatest(coalesce(p_minutes, 10), 0))
  );
$$;

-- ── grants ───────────────────────────────────────────────────────────────────
revoke all on function public.app_email_templates(text, text) from public, anon, authenticated;
revoke all on function public.app_email_template_save(text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.app_notify_context(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_email_recent(text, text, text, text, integer) from public, anon, authenticated;

-- The two admin ones are called from the browser with credentials, exactly like
-- app_smtp_get. The two notify ones are called ONLY by the Edge Function.
grant execute on function public.app_email_templates(text, text) to anon, authenticated;
grant execute on function public.app_email_template_save(text, text, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.app_notify_context(text, bigint, bigint) to service_role;
grant execute on function public.app_email_recent(text, text, text, text, integer) to service_role;
