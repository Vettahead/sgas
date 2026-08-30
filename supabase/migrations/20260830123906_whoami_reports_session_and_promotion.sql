-- ─────────────────────────────────────────────────────────────────────────────
-- The connection check, taught the new failure modes.
--
-- Since the lockdown, four quite different things all look identical from a desk
-- — every screen comes back empty. One is fixed by signing out and back in; one
-- stops the whole company; one is a piece of platform config that a restore can
-- drop. Guessing between them is a support call, so the panel says which.
-- ─────────────────────────────────────────────────────────────────────────────

-- Is the pre-request promotion actually installed? pg_roles is readable by
-- everyone, so this needs no elevated rights.
create or replace function public.app_promotion_installed()
returns boolean language sql stable set search_path = public
as $$
  select exists (
    select 1 from pg_roles
    where rolname = 'authenticator'
      and rolconfig::text like '%pgrst.db_pre_request=public.app_pre_request%'
  );
$$;
grant execute on function public.app_promotion_installed() to anon, authenticated;

-- Which proof this particular request arrived on. Useful during the changeover
-- and the thing to look at before deleting the JWT half.
create or replace function public.app_proof()
returns text language sql stable set search_path = public
as $$
  select case
    when public.app_session_user_id() is not null then 'session'
    when public.app_jwt_user_id() is not null then 'jwt'
    else 'none'
  end;
$$;
grant execute on function public.app_proof() to anon, authenticated;

create or replace function public.app_whoami()
returns json language sql stable set search_path = public
as $$
  select json_build_object(
    'role', current_user,
    'app_user_id', public.app_user_id(),
    'app_role', public.app_role(),
    'signed_in', public.app_is_signed_in(),
    'proof', public.app_proof(),
    'promotion_installed', public.app_promotion_installed(),
    'tokens_enabled', public.app_tokens_enabled(),
    'healthy', (current_user = 'authenticated' and public.app_is_signed_in()),
    'verdict', case
      when current_user = 'authenticated' and public.app_proof() = 'session'
        then 'Healthy. This browser is signed in with a session token — the new method — and screens will load normally.'
      when current_user = 'authenticated' and public.app_proof() = 'jwt'
        then 'Healthy, but signed in the OLD way. This browser is still using a signed token rather than a session token; signing out and back in moves it across. Nothing is wrong.'
      when not public.app_promotion_installed()
        then 'SERIOUS: the database is no longer promoting signed-in requests, so EVERY screen will be empty for EVERYONE. This is one line of configuration that a platform restore can drop. Re-run the session_pre_request_promotion migration — see the header of that file.'
      when not public.app_tokens_enabled()
        then 'The signing secret is missing from the database. Older browsers cannot sign in, though session tokens still work. The sgas_jwt_secret Vault entry has gone — see supabase/README.md.'
      when current_user = 'anon'
        then 'NOT SIGNED IN to the database, so screens will come back empty. Sign out and back in — that fixes it in almost every case. If it persists for everyone, check the connection panel again for a different message.'
      else 'Unexpected state. Worth reporting rather than working around.'
    end
  );
$$;

-- Who is actually signed in right now — a question the JWT design could not
-- answer at all, because it kept no record of what it had handed out.
create or replace function public.app_active_sessions(p_admin text default null, p_admin_pw text default null)
returns table (user_id bigint, username text, name text, role text,
               signed_in_at timestamptz, last_seen_at timestamptz,
               expires_at timestamptz, user_agent text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.app_is_admin(coalesce(p_admin, ''), coalesce(p_admin_pw, '')) then
    raise exception 'Not authorized';
  end if;
  return query
  select u.user_id, u.username, u.name, u.role,
         s.created_at, s.last_seen_at, s.expires_at, s.user_agent
  from public.app_session s
  join public.app_user u on u.user_id = s.user_id
  where s.revoked_at is null and s.expires_at > now()
  order by coalesce(s.last_seen_at, s.created_at) desc;
end $$;
grant execute on function public.app_active_sessions(text, text) to anon, authenticated;
