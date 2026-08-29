-- Somebody leaving is not the same as somebody never having been here.
-- left_on takes them out of the staff list and out of every trainer/assessor
-- picker, and changes NOTHING they have already taught: the courses, the
-- bookings and their own record all stay exactly as they are, because that is
-- the history the audit runs on.
alter table public.assessor add column if not exists left_on date;

comment on column public.assessor.left_on is
  'The day they left. Null = current staff. Set, and they drop out of the staff list and the pickers while every course they have ever run keeps their name.';

-- Deleting a login. Nothing in the database points at app_user, so unlike a
-- staff record this really can go. Two guards, because both mistakes lock
-- somebody out permanently:
--   * you cannot delete the account you are signed in as
--   * you cannot delete the last active admin, or nobody can administer anything
create or replace function public.app_delete_user(p_admin text, p_admin_pw text, p_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_target app_user%rowtype;
  v_admins_left integer;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  select * into v_target from app_user where user_id = p_user_id;
  if not found then raise exception 'That login no longer exists'; end if;

  if lower(v_target.username) = lower(p_admin) then
    raise exception 'You cannot delete the account you are signed in as';
  end if;

  if v_target.role = 'ADMIN' and v_target.is_active then
    select count(*) into v_admins_left
      from app_user
     where role = 'ADMIN' and is_active and user_id <> p_user_id;
    if v_admins_left = 0 then
      raise exception 'That is the last admin account — make somebody else an admin first';
    end if;
  end if;

  delete from app_user where user_id = p_user_id;
  return jsonb_build_object('deleted', v_target.username);
end;
$$;

revoke all on function public.app_delete_user(text, text, bigint) from public, anon, authenticated;
grant execute on function public.app_delete_user(text, text, bigint) to anon, authenticated;
