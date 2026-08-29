-- ── the delegate's emails ───────────────────────────────────────────────────
-- The first emails that leave the building. Everything before this went to
-- staff. The employer is copied when the company is set to receive paperwork.
--
-- WHY A SECOND CONTEXT FUNCTION rather than another branch in
-- app_notify_context: a cancelled booking has already had its session removed
-- by the time the email is composed, so this family — and only this family —
-- needs a second id passed in. Rather than add a fourth parameter to a function
-- four other families share, the awkwardness is kept where it belongs.
--
-- The templates say "PLEASE BRING PHOTOGRAPHIC ID" because flag_photo_outstanding
-- exists for a reason: the confirmation is the cheapest place to ask, and a
-- delegate who turns up without it has wasted the day.
--
-- Note there is no start time anywhere in the schema, only dates. Rather than
-- add a column nobody maintains, the wording carries "arrive in good time" and
-- can be edited in Admin the day that changes.
insert into public.email_template (key, name, description, mailbox, subject, body, tokens) values
(
  'booking_confirmed',
  'Delegate booked on a course',
  'Sent to the delegate when they are given dates. The employer is copied when the company is set to receive paperwork.',
  'bookings',
  'You are booked on {{course}}, {{dates}}',
  $tpl$Hello {{delegate}},

You are booked on to {{course}}.

  When:  {{dates}} ({{days}})
  Where: Specialist Gas Assessment Services

  What you are taking: {{quals}}

PLEASE BRING PHOTOGRAPHIC ID. Without it we cannot assess you and the day is
wasted.

Please arrive in good time so we can start promptly.

If anything here is wrong, or you cannot make these dates, reply to this email
or ring the office.

SGAS Training Management$tpl$,
  array['delegate','course','dates','start','end','days','quals','employer']
),
(
  'booking_moved',
  'Course dates changed (delegate)',
  'Sent to the delegate when the dates of the course they are on are changed.',
  'bookings',
  'Your course has moved to {{dates}}',
  $tpl$Hello {{delegate}},

{{course}} has been moved.

  Was:  {{old_dates}}
  Now:  {{dates}} ({{days}})

Everything else is unchanged, and you are still booked on. Please bring
photographic ID.

If the new dates do not work for you, ring the office as soon as you can.

SGAS Training Management$tpl$,
  array['delegate','course','dates','old_dates','start','end','days','quals','employer']
),
(
  'booking_rescheduled',
  'Delegate moved to another course',
  'Sent when a delegate is moved onto a different course or a different set of dates.',
  'bookings',
  'Your booking has moved — now {{dates}}',
  $tpl$Hello {{delegate}},

Your booking has been moved.

  Now on: {{course}}
  When:   {{dates}} ({{days}})

  What you are taking: {{quals}}

Please bring photographic ID.

SGAS Training Management$tpl$,
  array['delegate','course','dates','start','end','days','quals','employer']
),
(
  'booking_cancelled',
  'Delegate taken off a course',
  'Sent when a delegate is taken off a course and put back on the waiting list.',
  'bookings',
  'Your place on {{course}} has been released',
  $tpl$Hello {{delegate}},

You have been taken off {{course}} on {{dates}}.

You are still on our list and we will be in touch with new dates. Nothing you
have already passed is affected.

If you were not expecting this, please ring the office.

SGAS Training Management$tpl$,
  array['delegate','course','dates','start','end','days','quals','employer']
)
on conflict (key) do nothing;

create or replace function public.app_notify_booking(
  p_kind text, p_ref bigint, p_session bigint default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  t email_template%rowtype;
  b record;
  s record;
  v_quals text;
  v_cc text;
begin
  select * into t from email_template where key = p_kind;
  if not found then return jsonb_build_object('skip', 'unknown_kind'); end if;
  if not t.enabled then return jsonb_build_object('skip', 'template_off'); end if;

  select bk.booking_id, bk.session_id, bk.company_id,
         trim(coalesce(c.forename, '') || ' ' || coalesce(c.surname, '')) as delegate,
         nullif(trim(coalesce(c.email, '')), '') as delegate_email,
         co.name as employer,
         case when co.send_to_employer is not false then nullif(trim(coalesce(co.email, '')), '') end as employer_email
    into b
    from booking bk
    left join client c on c.client_id = bk.client_id
    left join company co on co.company_id = bk.company_id
   where bk.booking_id = p_ref;
  if not found then return jsonb_build_object('skip', 'no_booking'); end if;
  if b.delegate_email is null then
    return jsonb_build_object('skip', 'no_email', 'name', b.delegate);
  end if;

  select ses.start_date, ses.end_date, crs.name as course_name
    into s
    from session ses left join course crs on crs.course_id = ses.course_id
   where ses.session_id = coalesce(b.session_id, p_session);
  if not found then return jsonb_build_object('skip', 'no_session'); end if;

  -- What they are actually taking, in the codes they will recognise.
  select string_agg(cat.code, ', ' order by cat.code) into v_quals
    from booking_category bc join category cat on cat.category_id = bc.category_id
   where bc.booking_id = b.booking_id;

  v_cc := b.employer_email;

  return jsonb_build_object(
    'to', b.delegate_email,
    'cc', v_cc,
    'delegate', coalesce(nullif(b.delegate, ''), 'there'),
    'employer', coalesce(b.employer, ''),
    'course', coalesce(s.course_name, 'your course'),
    'start', s.start_date, 'end', s.end_date,
    'quals', coalesce(v_quals, 'to be confirmed'),
    'template', jsonb_build_object('subject', t.subject, 'body', t.body, 'mailbox', t.mailbox)
  );
end;
$$;

-- Stamped only after the confirmation has actually gone, so the column means
-- "they were told" rather than "we meant to tell them".
create or replace function public.app_booking_confirmed(p_booking_id bigint)
returns void
language sql security definer set search_path to 'public', 'extensions'
as $$
  update booking set confirmation_sent_at = now() where booking_id = p_booking_id;
$$;

revoke all on function public.app_notify_booking(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.app_booking_confirmed(bigint) from public, anon, authenticated;
grant execute on function public.app_notify_booking(text, bigint, bigint) to service_role;
grant execute on function public.app_booking_confirmed(bigint) to service_role;
