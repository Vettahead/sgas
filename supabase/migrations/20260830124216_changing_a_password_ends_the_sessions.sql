-- ─────────────────────────────────────────────────────────────────────────────
-- The point of being able to revoke: use it.
--
-- Until now, changing a password or disabling an account did not put anybody
-- out. A JWT already issued kept working for up to twelve hours whatever
-- happened afterwards, because there was no record of it to withdraw. So the one
-- moment where it matters most — somebody has been in the account and the
-- password is being changed because of it — was exactly the moment the system
-- could do nothing. That is fixed here.
--
-- app_delete_user needs no change: app_session references app_user with
-- ON DELETE CASCADE, so deleting the account takes its sessions with it.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.app_password_reset_complete(p_token text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions
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
  -- Any other outstanding link for this person dies with it.
  update password_reset set used_at = now()
   where user_id = u.user_id and used_at is null;

  -- And so does every session opened with the old password, everywhere. Whoever
  -- is resetting is at this screen; anybody else holding this account is out on
  -- their next request.
  perform public.app_session_revoke_all(u.user_id);

  return jsonb_build_object('user_id', u.user_id, 'username', u.username);
end;
$$;

create or replace function public.app_set_password(p_admin text, p_admin_pw text, p_target bigint, p_password text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  update app_user set password_hash = crypt(p_password, gen_salt('bf')) where user_id = p_target;
  -- An admin setting somebody's password expects that to take effect now, not
  -- at some point before tomorrow morning.
  perform public.app_session_revoke_all(p_target);
end;
$$;

create or replace function public.app_update_user(
  p_admin text, p_admin_pw text, p_target bigint, p_name text, p_email text,
  p_role text, p_is_active boolean, p_staff_id bigint default null, p_set_staff boolean default false)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare v_was_active boolean;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  select is_active into v_was_active from app_user where user_id = p_target;

  update app_user set
    name      = coalesce(p_name, name),
    email     = coalesce(p_email, email),
    role      = coalesce(p_role, role),
    is_active = coalesce(p_is_active, is_active),
    staff_id  = case when p_set_staff then p_staff_id else staff_id end
  where user_id = p_target;

  -- Disabling an account now actually shuts the door, rather than shutting it
  -- the next time they happen to sign in. (Their role is read live from app_user
  -- on every request, so a role change needs no revocation.)
  if v_was_active and p_is_active is false then
    perform public.app_session_revoke_all(p_target);
  end if;
end;
$$;
