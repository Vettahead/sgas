-- The browser has to know when its session ends, and it must not have to guess.
-- A JWT carries its own expiry, readable without verifying anything; a session
-- token is opaque random bytes and carries nothing. So the server says.
--
-- This is only so the app can sign somebody out tidily instead of showing them
-- empty screens. The database remains the only thing that decides whether a
-- token is good.
drop function if exists public.app_login(text, text);
create function public.app_login(p_username text, p_password text)
returns table (user_id bigint, username text, name text, email text,
               role text, is_active boolean, staff_id bigint,
               token text, session_token text, session_expires timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare r record; v_session text;
begin
  select u.user_id, u.username, u.name, u.email, u.role, u.is_active, u.staff_id
    into r
  from app_user u
  where lower(u.username) = lower(btrim(p_username))
    and u.is_active and u.password_hash = crypt(p_password, u.password_hash);

  -- No row, no leak: a bad username and a bad password are indistinguishable
  -- from out here, exactly as before.
  if not found then return; end if;

  v_session := public.app_session_issue(
    r.user_id,
    nullif(current_setting('request.headers', true), '')::json ->> 'user-agent'
  );

  return query
  select r.user_id, r.username, r.name, r.email, r.role, r.is_active, r.staff_id,
         public.app_mint_token(r.user_id, r.username, r.role, r.staff_id),
         v_session,
         (select s.expires_at from public.app_session s
           where s.token_hash = encode(digest(v_session, 'sha256'), 'hex'));
end $$;
revoke all on function public.app_login(text, text) from public;
grant execute on function public.app_login(text, text) to anon, authenticated;
