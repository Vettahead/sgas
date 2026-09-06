-- ── WHERE THE TEAMUP KEYS LIVE ──────────────────────────────────────────────
-- Same rule as Sage: a credential is never a column. Both Teamup keys go into
-- Supabase Vault and this table keeps only the ids, so a table dump — or a
-- restore handed to somebody — carries no key.
--
-- They are NOT function environment variables either, for one practical reason:
-- setting those means somebody in the Supabase dashboard, and this had to work
-- the same day it was written. The edge function asks for them at run time
-- instead, through an RPC only the service role may call.
--
-- NOTE ON WHAT THESE KEYS CAN DO. The calendar key is a READ-ONLY sharing link
-- created on the Teamup Sharing page. It cannot alter or delete anything at
-- their end, which is deliberate and is what makes running the pull safe while
-- SGAS is still working in Teamup every day. If it is ever replaced with a
-- modify link, that property is gone — so replace it with another read-only one.

create table if not exists public.teamup_connection (
  id                 boolean primary key default true check (id),   -- one row, forever
  api_secret_id      uuid,     -- -> vault.secrets(id), the Teamup-Token API key
  calendar_secret_id uuid,     -- -> vault.secrets(id), the ks… sharing link key
  calendar_note      text,     -- e.g. 'read-only, all calendars, created 6 Sep 2026'
  updated_at         timestamptz not null default now()
);

alter table public.teamup_connection enable row level security;   -- and NO policies
revoke all on table public.teamup_connection from anon, authenticated;

-- Store or replace the keys. Admin only, and the values never come back out
-- through this function.
create or replace function public.app_teamup_store_keys(
  p_admin text, p_admin_pw text, p_api_key text, p_calendar_key text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions', 'vault'
as $$
declare v_api uuid; v_cal uuid;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  insert into teamup_connection (id) values (true) on conflict (id) do nothing;
  select api_secret_id, calendar_secret_id into v_api, v_cal from teamup_connection where id;

  if coalesce(trim(p_api_key), '') <> '' then
    if v_api is null then
      v_api := vault.create_secret(p_api_key, 'sgas_teamup_api_key', 'Teamup API key (Teamup-Token header)');
    else
      perform vault.update_secret(v_api, p_api_key, 'sgas_teamup_api_key', 'Teamup API key (Teamup-Token header)');
    end if;
  end if;

  if coalesce(trim(p_calendar_key), '') <> '' then
    if v_cal is null then
      v_cal := vault.create_secret(p_calendar_key, 'sgas_teamup_calendar_key', 'Teamup read-only calendar key');
    else
      perform vault.update_secret(v_cal, p_calendar_key, 'sgas_teamup_calendar_key', 'Teamup read-only calendar key');
    end if;
  end if;

  update teamup_connection
     set api_secret_id = v_api, calendar_secret_id = v_cal,
         calendar_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), calendar_note),
         updated_at = now()
   where id;
  return jsonb_build_object('ok', true, 'api_set', v_api is not null, 'calendar_set', v_cal is not null);
end;
$$;

-- What the edge function calls. SERVICE ROLE ONLY — it hands out both keys in
-- clear, and the edge function cannot read the vault schema over PostgREST
-- (only public is exposed), which is why this exists at all.
create or replace function public.app_teamup_dispatch()
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions', 'vault'
as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
           'api_key', va.decrypted_secret,
           'calendar_key', vc.decrypted_secret,
           'note', c.calendar_note)
    into v_out
    from teamup_connection c
    left join vault.decrypted_secrets va on va.id = c.api_secret_id
    left join vault.decrypted_secrets vc on vc.id = c.calendar_secret_id
   where c.id;
  return coalesce(v_out, jsonb_build_object('error', 'not_configured'));
end;
$$;

-- Does a key exist, without saying what it is. Safe for a screen to call.
create or replace function public.app_teamup_configured(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_build_object(
      'api', api_secret_id is not null,
      'calendar', calendar_secret_id is not null,
      'note', calendar_note,
      'updated_at', updated_at)
    from teamup_connection where id), jsonb_build_object('api', false, 'calendar', false));
end;
$$;

revoke all on function public.app_teamup_store_keys(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.app_teamup_dispatch() from public, anon, authenticated;
revoke all on function public.app_teamup_configured(text, text) from public, anon, authenticated;
grant execute on function public.app_teamup_store_keys(text, text, text, text, text) to anon, authenticated;
grant execute on function public.app_teamup_configured(text, text) to anon, authenticated;
grant execute on function public.app_teamup_dispatch() to service_role;
