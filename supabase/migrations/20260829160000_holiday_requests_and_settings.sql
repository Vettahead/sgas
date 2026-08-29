-- ── settings ────────────────────────────────────────────────────────────────
-- Small, non-secret, one row per key. Readable by the app (the calendar has to
-- know who approves holidays before it can decide whether to ask), writable
-- only by an admin.
create table if not exists public.app_setting (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_setting (key, value)
values ('holiday_approver_staff_id', 'null'::jsonb)
on conflict (key) do nothing;

alter table public.app_setting enable row level security;
drop policy if exists p_setting_read on public.app_setting;
create policy p_setting_read on public.app_setting for select using (true);
revoke insert, update, delete on table public.app_setting from anon, authenticated;
grant select on table public.app_setting to anon, authenticated;

create or replace function public.app_setting_save(p_admin text, p_admin_pw text, p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  insert into app_setting (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;
revoke all on function public.app_setting_save(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_setting_save(text, text, text, jsonb) to anon, authenticated;

-- ── holiday requests ────────────────────────────────────────────────────────
alter table public.holiday add column if not exists status text not null default 'APPROVED';
alter table public.holiday add column if not exists requested_by bigint references public.assessor(assessor_id) on delete set null;
alter table public.holiday add column if not exists decided_by bigint references public.assessor(assessor_id) on delete set null;
alter table public.holiday add column if not exists decided_at timestamptz;
alter table public.holiday add column if not exists decision_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holiday_status_chk') then
    alter table public.holiday add constraint holiday_status_chk
      check (status in ('REQUESTED','APPROVED','REJECTED'));
  end if;
end $$;

create index if not exists holiday_status_idx on public.holiday (status);

-- ── templates gain their own placeholder list ───────────────────────────────
-- One global list was fine with one kind of email and is wrong with two:
-- {{course}} means nothing in a holiday email.
alter table public.email_template add column if not exists tokens text[] not null default '{}';

update public.email_template
   set tokens = array['trainer','course','dates','start','end','days','room','delegates']
 where key in ('trainer_assigned','trainer_removed');
update public.email_template
   set tokens = array['trainer','course','dates','start','end','days','room','delegates','old_dates']
 where key = 'course_moved';

insert into public.email_template (key, name, description, mailbox, subject, body, tokens) values
(
  'holiday_requested',
  'Holiday request submitted',
  'Sent to whoever approves holidays when somebody asks for time off.',
  'holidays',
  'Holiday request from {{staff}} — {{dates}}',
  $tpl${{staff}} has asked for time off.

  When:  {{dates}}
  Days:  {{days}}
  Note:  {{note}}

Approve or reject it on the dashboard.

SGAS Training Management$tpl$,
  array['staff','approver','dates','start','end','days','note']
),
(
  'holiday_approved',
  'Holiday approved',
  'Sent to the person who asked, once their time off is approved.',
  'holidays',
  'Your holiday is approved — {{dates}}',
  $tpl$Hello {{staff}},

Your time off has been approved.

  When:  {{dates}}
  Days:  {{days}}

It is on the calendar, so nobody will put you on a course those days.

SGAS Training Management$tpl$,
  array['staff','approver','dates','start','end','days','note','reason']
),
(
  'holiday_rejected',
  'Holiday not approved',
  'Sent to the person who asked, if their request is turned down.',
  'holidays',
  'Your holiday request — {{dates}}',
  $tpl$Hello {{staff}},

Your request for time off on {{dates}} has not been approved.

  Reason: {{reason}}

Have a word with the office if you need to talk it through.

SGAS Training Management$tpl$,
  array['staff','approver','dates','start','end','days','note','reason']
)
on conflict (key) do nothing;

-- ── one context function for every kind of notification ─────────────────────
-- p_ref is "the thing this is about": a session for the course emails, a
-- holiday for the holiday ones. The old session-only signature is dropped.
--
-- NOTE on the approver lookup: a record variable is only IS NOT NULL when every
-- field is non-null, which is not the question being asked — so the approver's
-- name and email are held in plain variables.
drop function if exists public.app_notify_context(text, bigint, bigint);

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
  v_staff record;
  v_count integer;
  v_days integer;
  v_to text;
  v_appr_id bigint;
  v_appr_name text;
  v_appr_email text;
begin
  select * into t from email_template where key = p_kind;
  if not found then return jsonb_build_object('skip', 'unknown_kind'); end if;
  if not t.enabled then return jsonb_build_object('skip', 'template_off'); end if;

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
      'delegates', v_count,
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
      'working_days', v_days,
      'note', nullif(trim(coalesce(h.note, '')), ''),
      'reason', nullif(trim(coalesce(h.decision_note, '')), ''),
      'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
    );
  end if;

  return jsonb_build_object('skip', 'unknown_kind');
end;
$$;

revoke all on function public.app_notify_context(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.app_notify_context(text, bigint, bigint) to service_role;
