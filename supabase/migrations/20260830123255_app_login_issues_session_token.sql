-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION TOKENS, PART 2 — sign in gets you both.
--
-- app_login returns the new session token AS WELL AS the JWT. Both are honoured,
-- so a browser still running yesterday's build carries on working through the
-- changeover and nothing has to be deployed in lockstep.
--
-- SUPERSEDED IN PART: app_login is replaced again in
-- 20260830123414_app_login_returns_session_expiry.sql, which adds the expiry.
-- ─────────────────────────────────────────────────────────────────────────────

-- 12 hours, the same life the JWT has. Unlike the JWT this one can be ended
-- early, which is the point.
create or replace function public.app_session_hours()
returns int language sql stable set search_path = public
as $$ select 12; $$;

-- Mint: 256 bits of randomness, returned once and never stored. Only its hash
-- goes in the table, so nobody — including whoever holds a database dump — can
-- reconstruct a live session from it.
create or replace function public.app_session_issue(p_user_id bigint, p_user_agent text default null)
returns text language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare v_token text;
begin
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.app_session (token_hash, user_id, expires_at, last_seen_at, user_agent)
  values (encode(digest(v_token, 'sha256'), 'hex'),
          p_user_id,
          now() + make_interval(hours => public.app_session_hours()),
          now(),
          left(p_user_agent, 300));

  -- Housekeeping on the one call that is already doing a write.
  delete from public.app_session where expires_at < now() - interval '30 days';

  return v_token;
end $$;
revoke all on function public.app_session_issue(bigint, text) from public, anon, authenticated;

-- ── ending a session ─────────────────────────────────────────────────────────
-- The thing a JWT can never do. Signing out now actually ends the session at the
-- database rather than only forgetting the token in the browser.
create or replace function public.app_logout()
returns void language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare v_token text := public.app_session_token();
begin
  if v_token is null then return; end if;
  update public.app_session
     set revoked_at = now()
   where token_hash = encode(digest(v_token, 'sha256'), 'hex')
     and revoked_at is null;
end $$;
grant execute on function public.app_logout() to anon, authenticated;

-- Sign out everywhere, for one account. Used when a password is changed or
-- reset, and when an admin disables somebody. Until now a disabled account kept
-- working for up to twelve hours, because the JWT already issued could not be
-- recalled.
create or replace function public.app_session_revoke_all(p_user_id bigint)
returns int language plpgsql volatile security definer
set search_path = public
as $$
declare n int;
begin
  update public.app_session
     set revoked_at = now()
   where user_id = p_user_id and revoked_at is null and expires_at > now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.app_session_revoke_all(bigint) from public, anon, authenticated;
