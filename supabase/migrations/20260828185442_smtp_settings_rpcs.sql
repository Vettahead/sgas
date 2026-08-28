-- The only way in and out of the SMTP settings.
--
-- Same shape as app_list_users: SECURITY DEFINER, admin credentials checked by
-- app_is_admin(). The read NEVER returns a password, only whether one is set --
-- so the Admin screen can leave the field blank for ever after the first save.

create or replace function public.app_smtp_get(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'host',   s.host,
    'port',   s.port,
    'secure', s.secure,
    'updated_at', s.updated_at,
    'mailboxes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', m.key, 'address', m.address, 'username', m.username,
        'from_name', m.from_name,
        -- the whole point: a boolean, never the secret
        'password_set', (m.secret_id is not null)
      ) order by m.key)
      from smtp_mailbox m), '[]'::jsonb)
  ) into v_out
  from smtp_setting s where s.id;
  return v_out;
end;
$$;

-- Saving. A blank or absent password means "leave the stored one alone", which
-- is what lets the field sit empty in the UI. '__CLEAR__' removes one.
create or replace function public.app_smtp_save(
  p_admin text, p_admin_pw text,
  p_host text, p_port integer, p_secure boolean,
  p_mailboxes jsonb            -- [{key, address, username, from_name, password}]
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  mb jsonb; v_key text; v_pw text; v_secret uuid; v_name text;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  update smtp_setting
     set host = coalesce(nullif(trim(p_host), ''), host),
         port = coalesce(p_port, port),
         secure = coalesce(p_secure, secure),
         updated_at = now()
   where id;

  for mb in select * from jsonb_array_elements(coalesce(p_mailboxes, '[]'::jsonb))
  loop
    v_key := mb->>'key';
    if v_key is null or v_key not in ('crm','holidays','bookings') then continue; end if;

    update smtp_mailbox
       set address   = coalesce(nullif(trim(mb->>'address'), ''), address),
           username  = coalesce(nullif(trim(mb->>'username'), ''), username),
           from_name = coalesce(nullif(trim(mb->>'from_name'), ''), from_name),
           updated_at = now()
     where key = v_key;

    v_pw := mb->>'password';
    if v_pw is not null and length(v_pw) > 0 then
      select secret_id into v_secret from smtp_mailbox where key = v_key;
      if v_pw = '__CLEAR__' then
        if v_secret is not null then
          perform vault.update_secret(v_secret, 'REMOVED', 'sgas_smtp_' || v_key, 'cleared');
          update smtp_mailbox set secret_id = null, updated_at = now() where key = v_key;
        end if;
      else
        v_name := 'sgas_smtp_' || v_key;
        if v_secret is null then
          v_secret := vault.create_secret(v_pw, v_name, 'SMTP password for ' || v_key || '@sgas.co.uk');
          update smtp_mailbox set secret_id = v_secret, updated_at = now() where key = v_key;
        else
          perform vault.update_secret(v_secret, v_pw, v_name, 'SMTP password for ' || v_key || '@sgas.co.uk');
          update smtp_mailbox set updated_at = now() where key = v_key;
        end if;
      end if;
    end if;
  end loop;

  return app_smtp_get(p_admin, p_admin_pw);
end;
$$;

-- The send log, for the Admin screen. Also admin-only.
create or replace function public.app_email_log(p_admin text, p_admin_pw text, p_limit integer default 50)
returns table (sent_at timestamptz, mailbox text, to_address text, subject text, kind text, ok boolean, error text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  return query
    select l.sent_at, l.mailbox, l.to_address, l.subject, l.kind, l.ok, l.error
    from email_log l order by l.sent_at desc limit least(coalesce(p_limit, 50), 500);
end;
$$;

revoke all on function public.app_smtp_get(text, text) from public;
revoke all on function public.app_smtp_save(text, text, text, integer, boolean, jsonb) from public;
revoke all on function public.app_email_log(text, text, integer) from public;
grant execute on function public.app_smtp_get(text, text) to anon, authenticated;
grant execute on function public.app_smtp_save(text, text, text, integer, boolean, jsonb) to anon, authenticated;
grant execute on function public.app_email_log(text, text, integer) to anon, authenticated;
