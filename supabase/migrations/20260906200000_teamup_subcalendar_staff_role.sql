-- ── "KEITH ASSESSMENTS" IS NOT KEITH'S DIARY ────────────────────────────────
-- The first model had three kinds of Teamup stream: a course, a person's own
-- diary, or non-teaching time. A sub-calendar called "Keith Assessments" was
-- filed as the second, and that is wrong. Chris: "where assessments is in the
-- calendar they will be courses that person has assessed."
--
-- Checked against the imported Access data, and he is right: of the 156 dates
-- on "Keith Assessments", 110 have an assessment record naming K Rimmer as the
-- assessor. Of the 123 with any Access record at all, 89% are his. It is a
-- COURSE STREAM with a person permanently in a role on it — not a diary.
--
-- That is a fourth shape, and it is the most common one they have: "Keith
-- Assessments" (155 events), "Denis Assessments" (111), "Phil Training" (32).
-- Filing those three as diaries would have thrown the assessor away on nearly
-- three hundred sessions. So a stream can now say BOTH what it is and who is on
-- it in what capacity, and every session built from it starts with that person
-- already in the right slot.
alter table public.teamup_subcalendar
  add column if not exists staff_role     text,
  add column if not exists proposed_role  text,
  add column if not exists proposed_staff bigint references public.assessor(assessor_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teamup_subcalendar_role_ck') then
    alter table public.teamup_subcalendar add constraint teamup_subcalendar_role_ck
      check (staff_role is null or staff_role in ('assessor','trainer','verifier'));
  end if;
end $$;

comment on column public.teamup_subcalendar.staff_role is
  'When decision = course and a member of staff is named: the slot they fill on every session built from this stream. "Keith Assessments" is course + Keith + assessor.';

create or replace function public.app_teamup_map_save(
  p_admin text, p_admin_pw text, p_subcalendar_id bigint,
  p_decision text, p_course_id bigint default null, p_staff_id bigint default null,
  p_staff_role text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  if p_decision is not null and p_decision not in ('course','staff','holiday','engagement','ignore') then
    raise exception 'Unknown decision';
  end if;
  -- A person on a course stream is a ROLE; a person on their own stream is a
  -- DIARY. The two must not be able to blur into each other, so naming somebody
  -- on a course stream without saying what they do is refused.
  if p_decision = 'course' and p_staff_id is not null
     and coalesce(p_staff_role, '') not in ('assessor','trainer','verifier') then
    raise exception 'Say what that person does on these courses';
  end if;

  update teamup_subcalendar
     set decision = p_decision,
         target_course_id = case when p_decision = 'course' then p_course_id else null end,
         target_staff_id  = case when p_decision in ('course','staff') then p_staff_id else null end,
         staff_role       = case when p_decision = 'course' then nullif(p_staff_role, '') else null end,
         decided_by = p_admin, decided_at = now(), updated_at = now()
   where subcalendar_id = p_subcalendar_id;
  if not found then raise exception 'No such sub-calendar'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.app_teamup_map_save(text, text, bigint, text, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.app_teamup_map_save(text, text, bigint, text, bigint, bigint, text) to anon, authenticated;
