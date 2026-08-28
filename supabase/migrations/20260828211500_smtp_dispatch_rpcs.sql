-- Why this exists: the send-email function used to read the SMTP password with
--     db.schema('vault').from('decrypted_secrets')
-- which cannot work. PostgREST only exposes the schemas it is configured with —
-- public and graphql_public — so a request for the vault schema is refused
-- before it reaches the database at all. The password decrypts perfectly well
-- in SQL; it was the route to it that was wrong.
--
-- The fix is to stop reaching across schemas from outside and give the function
-- one door in. app_smtp_dispatch() hands back everything a send needs in a
-- single call, and app_email_log_write() records the attempt. Both are
-- service_role only: the anon key that every browser holds cannot execute
-- either of them, which is what keeps the password inside the server.

create or replace function public.app_smtp_dispatch(p_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
    'host', s.host, 'port', s.port, 'secure', s.secure,
    'key', m.key, 'address', m.address, 'username', m.username,
    'from_name', m.from_name,
    'password', v.decrypted_secret
  ) into v_out
  from smtp_setting s
  join smtp_mailbox m on m.key = p_key
  left join vault.decrypted_secrets v on v.id = m.secret_id
  where s.id;

  -- A missing mailbox and a mailbox with no password are different problems and
  -- deserve different sentences on the screen.
  if v_out is null then
    return jsonb_build_object('error', 'unknown_mailbox');
  end if;
  if v_out->>'host' is null then
    return jsonb_build_object('error', 'no_server');
  end if;
  if v_out->>'password' is null then
    return jsonb_build_object('error', 'no_password', 'address', v_out->>'address');
  end if;
  return v_out;
end;
$$;

create or replace function public.app_email_log_write(
  p_mailbox text, p_to text, p_subject text, p_kind text,
  p_ok boolean, p_error text, p_ref_id text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  insert into email_log (mailbox, to_address, subject, kind, ok, error, ref_id)
  values (p_mailbox, p_to, p_subject, coalesce(p_kind, 'manual'), coalesce(p_ok, false), p_error, p_ref_id);
end;
$$;

-- Nobody but the server. Note the deliberate absence of anon and authenticated:
-- app_smtp_dispatch returns a plaintext password, so a browser must never be
-- able to call it.
-- 'from public' alone is NOT enough. Supabase's default privileges grant
-- EXECUTE to anon and authenticated directly, so those grants survive a revoke
-- aimed at PUBLIC -- checked with has_function_privilege('anon', ...), which
-- still said true until these two lines were added.
revoke all on function public.app_smtp_dispatch(text) from public, anon, authenticated;
revoke all on function public.app_email_log_write(text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.app_smtp_dispatch(text) to service_role;
grant execute on function public.app_email_log_write(text, text, text, text, boolean, text, text) to service_role;
