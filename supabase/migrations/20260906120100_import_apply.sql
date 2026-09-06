-- ── APPLY THE IMPORT DECISIONS ──────────────────────────────────────────────
-- Until now the Data import screen only recorded intentions. A row saying
-- "create EDINA UK LTD as a company" was a note to self: no company existed,
-- and `target_id` stayed null. So 109 employers and one assessor were confirmed
-- and none of them were anywhere. Nothing else in the import can be built on
-- top of that, because there is nothing for a delegate record to point at.
--
-- This is the step that makes the decisions real. It is deliberately the ONLY
-- thing that writes: the screen stays a place where a person answers questions,
-- and creation happens once, on purpose, when somebody presses Apply.
--
-- THREE RULES IT KEEPS
--
--  1. IT IS SAFE TO RUN TWICE. Anything already carrying a target_id is
--     skipped, and a name that already exists is linked rather than created
--     again. Run it, decide six more rows, run it again.
--
--  2. THE SAME NAME IS THE SAME THING. Rows are grouped by their target name,
--     case and surrounding spaces ignored. That is the whole merge story Chris
--     asked for: give "EDINA" and "EDINA UK LTD" the same name to create under
--     and they arrive as one company, with both Access spellings pointing at it.
--
--  3. ONLY 'create' MAY CREATE. A 'map' row names something that is supposed to
--     exist already, so if it cannot be found it is left alone and counted as
--     unresolved rather than quietly invented — a mistyped map should surface,
--     not spawn a duplicate.
--
-- New staff are created as PAST staff, dated today. Everyone on this list left
-- before the current staff table was written (Callon Fielding last assessed in
-- February 2025), so "here now" would be the wrong default and would put them
-- in the dropdown when somebody books a course. Today's date is a placeholder
-- for "not here any more" — correct it on the staff record if the real date is
-- known.

create or replace function public.app_import_apply(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  r               record;
  v_id            bigint;
  v_staff_new     integer := 0;
  v_staff_linked  integer := 0;
  v_comp_new      integer := 0;
  v_comp_linked   integer := 0;
  v_cat_new       integer := 0;
  v_cat_linked    integer := 0;
  v_unresolved    integer := 0;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  -- ── assessors and verifiers ───────────────────────────────────────────────
  for r in
    select lower(btrim(target_code))    as key,
           min(btrim(target_code))      as nm,
           bool_or(decision = 'create') as may_create
      from import_mapping
     where kind = 'staff' and decision in ('create', 'map')
       and target_id is null and coalesce(btrim(target_code), '') <> ''
     group by lower(btrim(target_code))
  loop
    v_id := null;
    select assessor_id into v_id from assessor
     where lower(btrim(name)) = r.key order by assessor_id limit 1;

    if v_id is not null then
      v_staff_linked := v_staff_linked + 1;
    elsif r.may_create then
      insert into assessor (name, is_assessor, left_on)
           values (r.nm, true, current_date)
        returning assessor_id into v_id;
      v_staff_new := v_staff_new + 1;
    end if;

    if v_id is not null then
      update import_mapping set target_id = v_id
       where kind = 'staff' and decision in ('create', 'map')
         and target_id is null and lower(btrim(target_code)) = r.key;
    end if;
  end loop;

  -- ── employers ─────────────────────────────────────────────────────────────
  for r in
    select lower(btrim(target_code))    as key,
           min(btrim(target_code))      as nm,
           bool_or(decision = 'create') as may_create
      from import_mapping
     where kind = 'employer' and decision in ('create', 'map')
       and target_id is null and coalesce(btrim(target_code), '') <> ''
     group by lower(btrim(target_code))
  loop
    v_id := null;
    select company_id into v_id from company
     where lower(btrim(name)) = r.key order by company_id limit 1;

    if v_id is not null then
      v_comp_linked := v_comp_linked + 1;
    elsif r.may_create then
      insert into company (name) values (r.nm) returning company_id into v_id;
      v_comp_new := v_comp_new + 1;
    end if;

    if v_id is not null then
      update import_mapping set target_id = v_id
       where kind = 'employer' and decision in ('create', 'map')
         and target_id is null and lower(btrim(target_code)) = r.key;
    end if;
  end loop;

  -- ── qualifications ────────────────────────────────────────────────────────
  -- A created qualification lands in scheme 'Other' on purpose. It has to be
  -- visible as something nobody has filed yet, and the Courses screen already
  -- groups by scheme, so it shows up there asking to be put somewhere.
  for r in
    select lower(btrim(target_code))    as key,
           min(btrim(target_code))      as nm,
           bool_or(decision = 'create') as may_create
      from import_mapping
     where kind = 'qualification' and decision in ('create', 'map')
       and target_id is null and coalesce(btrim(target_code), '') <> ''
     group by lower(btrim(target_code))
  loop
    v_id := null;
    select category_id into v_id from category
     where lower(btrim(code)) = r.key order by category_id limit 1;

    if v_id is not null then
      v_cat_linked := v_cat_linked + 1;
    elsif r.may_create then
      insert into category (code, scheme) values (upper(r.nm), 'Other')
        returning category_id into v_id;
      v_cat_new := v_cat_new + 1;
    end if;

    if v_id is not null then
      update import_mapping set target_id = v_id
       where kind = 'qualification' and decision in ('create', 'map')
         and target_id is null and lower(btrim(target_code)) = r.key;
    end if;
  end loop;

  -- Whatever is still pointing at nothing. Non-zero means a 'map' row names
  -- something that does not exist — worth showing rather than swallowing.
  select count(*) into v_unresolved
    from import_mapping
   where decision in ('create', 'map') and target_id is null;

  return jsonb_build_object(
    'staff_created',     v_staff_new,
    'staff_linked',      v_staff_linked,
    'companies_created', v_comp_new,
    'companies_linked',  v_comp_linked,
    'categories_created', v_cat_new,
    'categories_linked',  v_cat_linked,
    'unresolved',        v_unresolved
  );
end;
$$;

revoke all on function public.app_import_apply(text, text) from public, anon, authenticated;
grant execute on function public.app_import_apply(text, text) to anon, authenticated;
