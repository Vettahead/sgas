-- One button, not three. Reading the calendar and putting it on the calendar is
-- one thought as far as anybody using this is concerned, and doing half of it
-- leaves the two out of step.
create or replace function public.app_teamup_classify(p_admin text, p_admin_pw text)
returns jsonb language plpgsql security definer set search_path to 'public','extensions' as $$
declare v jsonb; w jsonb; x jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  v := app_teamup_classify_run();
  w := app_teamup_pick_scheme_course();
  x := app_teamup_promote_run();
  return v || w || x;
end;
$$;
