-- Applied 30 Aug 2026. The lockdown is done, so "is it safe to lock down?" is
-- no longer the question this answers. What it answers now is "why is this
-- person seeing empty screens?" — which since the lockdown has two innocent
-- causes and one serious one that look identical from the outside:
--   session expired / signed out  -> sign out and back in, fixed in seconds
--   legacy JWT secret revoked     -> nobody can work until it is restored
create or replace function public.app_whoami()
returns json language sql stable set search_path = public
as $$
  select json_build_object(
    'role', current_user,
    'app_user_id', public.app_jwt_user_id(),
    'app_role', public.app_jwt_role(),
    'signed_in', public.app_is_signed_in(),
    'tokens_enabled', public.app_tokens_enabled(),
    'healthy', (current_user = 'authenticated' and public.app_is_signed_in()),
    'verdict', case
      when current_user = 'authenticated' and public.app_is_signed_in()
        then 'Healthy. This browser is signed in to the database and screens will load normally.'
      when not public.app_tokens_enabled()
        then 'SERIOUS: the signing secret is missing from the database. Nobody can sign in properly and every screen will be empty. The sgas_jwt_secret Vault entry has gone — see supabase/README.md.'
      when current_user = 'anon'
        then 'NOT SIGNED IN to the database, so screens will come back empty. Sign out and back in first — that fixes it in almost every case. If it persists for everyone, the legacy JWT secret has probably been revoked, which breaks sign-in for the whole company (see supabase/README.md).'
      else 'Unexpected state. Worth reporting rather than working around.'
    end
  );
$$;

revoke all on function public.app_whoami() from public;
grant execute on function public.app_whoami() to anon, authenticated;
