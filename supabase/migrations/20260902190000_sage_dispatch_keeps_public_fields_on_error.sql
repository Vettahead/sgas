-- app_sage_dispatch used to REPLACE its whole answer with {"error": "..."},
-- which threw the client id away along with everything else. That is wrong for
-- the one caller that legitimately runs BEFORE there is a connection: `start`
-- needs the client id to build the sign-in URL, and 'not_connected' is the
-- exact state it exists to get you out of. So pressing Connect failed with
-- "Not connected to Sage yet — press Connect to Sage", which is a sentence that
-- tells you to do the thing you just did.
--
-- The error is now added ALONGSIDE the fields rather than instead of them.
-- Callers that must not proceed still check `error` — freshAccessToken throws
-- on any of them — while `start` can read client_id regardless. Secrets are
-- still only ever returned to the service role, which remains the only role
-- that may execute this function at all.
create or replace function public.app_sage_dispatch()
returns jsonb language plpgsql security definer
set search_path to 'public', 'extensions', 'vault' as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
    'client_id', c.client_id, 'client_secret', vs.decrypted_secret,
    'access_token', va.decrypted_secret, 'refresh_token', vr.decrypted_secret,
    'access_expires_at', c.access_expires_at,
    'business_id', c.business_id, 'scope', c.scope
  ) into v_out
  from sage_connection c
  left join vault.decrypted_secrets vs on vs.id = c.client_secret_id
  left join vault.decrypted_secrets va on va.id = c.access_secret_id
  left join vault.decrypted_secrets vr on vr.id = c.refresh_secret_id
  where c.id;

  if v_out is null then return jsonb_build_object('error', 'no_row'); end if;

  -- The stages, in the order they are reached. Each one names the next step.
  if v_out->>'client_id' is null then
    return v_out || jsonb_build_object('error', 'no_app');
  elsif v_out->>'client_secret' is null then
    return v_out || jsonb_build_object('error', 'no_client_secret');
  elsif v_out->>'refresh_token' is null then
    return v_out || jsonb_build_object('error', 'not_connected');
  end if;
  return v_out;
end; $$;

revoke all on function public.app_sage_dispatch() from public, anon, authenticated;
grant execute on function public.app_sage_dispatch() to service_role;
