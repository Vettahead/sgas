-- ─────────────────────────────────────────────────────────────────────────────
-- The only ways in and out of the Sage connection.
--
-- Two sizes of door, and the difference matters:
--
--   ADMIN doors (app_sage_get / app_sage_save_app / app_sage_disconnect)
--     checked with app_is_admin(), granted to anon+authenticated like the SMTP
--     screen. They NEVER return a token or a client secret — only whether one
--     is set. The Admin screen can therefore leave the fields blank for ever
--     after the first save, exactly as it does for the SMTP password.
--
--   SERVICE doors (app_sage_dispatch / app_sage_store_tokens /
--     app_sage_sync_result / app_sage_cache_invoices / app_sage_apply_payments)
--     service_role ONLY. The anon key every browser holds cannot execute them.
--     This is what keeps the refresh token inside the server.
--
-- The dispatch/store pair exists for the same reason app_smtp_dispatch does:
-- the edge function cannot read the vault schema over PostgREST (only public
-- and graphql_public are exposed), so it gets one call that hands back
-- everything a refresh needs, and one call that puts the rotated token back.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Admin: what is the state of the connection? ──────────────────────────────
create or replace function public.app_sage_get(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_out jsonb;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'business_id',    c.business_id,
    'business_name',  c.business_name,
    'client_id',      c.client_id,
    -- booleans, never the secrets themselves
    'client_secret_set', (c.client_secret_id is not null),
    'connected',      (c.refresh_secret_id is not null),
    'scope',          c.scope,
    'connected_at',   c.connected_at,
    'connected_by',   c.connected_by,
    'refresh_expires_at', c.refresh_expires_at,
    'last_sync_at',   c.last_sync_at,
    'last_sync_ok',   c.last_sync_ok,
    'last_sync_error',c.last_sync_error,
    'unmatched_invoices', (select count(*) from sage_invoice where match_state = 'unmatched')
  ) into v_out
  from sage_connection c where c.id;
  return v_out;
end;
$$;

-- ── Admin: register the developer app ────────────────────────────────────────
-- A blank secret means "leave the stored one alone"; '__CLEAR__' removes it.
-- Same convention as app_smtp_save, so the Admin screen behaves consistently.
create or replace function public.app_sage_save_app(
  p_admin text, p_admin_pw text, p_client_id text, p_client_secret text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_secret uuid;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;

  update sage_connection
     set client_id = coalesce(nullif(trim(p_client_id), ''), client_id),
         updated_at = now()
   where id;

  if p_client_secret is not null and length(p_client_secret) > 0 then
    select client_secret_id into v_secret from sage_connection where id;
    if p_client_secret = '__CLEAR__' then
      if v_secret is not null then
        perform vault.update_secret(v_secret, 'REMOVED', 'sgas_sage_client_secret', 'cleared');
        update sage_connection set client_secret_id = null, updated_at = now() where id;
      end if;
    elsif v_secret is null then
      v_secret := vault.create_secret(p_client_secret, 'sgas_sage_client_secret',
                                      'Sage Accounting developer app client secret');
      update sage_connection set client_secret_id = v_secret, updated_at = now() where id;
    else
      perform vault.update_secret(v_secret, p_client_secret, 'sgas_sage_client_secret',
                                  'Sage Accounting developer app client secret');
      update sage_connection set updated_at = now() where id;
    end if;
  end if;

  return app_sage_get(p_admin, p_admin_pw);
end;
$$;

-- ── Admin: disconnect ────────────────────────────────────────────────────────
-- Drops the tokens and forgets the business. The cached invoices are left
-- alone deliberately: they are a record of what Sage said, and throwing them
-- away would also throw away every hand-made match.
create or replace function public.app_sage_disconnect(p_admin text, p_admin_pw text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_a uuid; v_r uuid;
begin
  if not app_is_admin(p_admin, p_admin_pw) then raise exception 'Not authorized'; end if;
  select access_secret_id, refresh_secret_id into v_a, v_r from sage_connection where id;
  if v_a is not null then perform vault.update_secret(v_a, 'REMOVED', 'sgas_sage_access',  'disconnected'); end if;
  if v_r is not null then perform vault.update_secret(v_r, 'REMOVED', 'sgas_sage_refresh', 'disconnected'); end if;
  update sage_connection
     set access_secret_id = null, refresh_secret_id = null,
         access_expires_at = null, refresh_expires_at = null,
         business_id = null, business_name = null,
         connected_at = null, connected_by = null,
         last_sync_ok = null, last_sync_error = null,
         updated_at = now()
   where id;
  return app_sage_get(p_admin, p_admin_pw);
end;
$$;

-- ── Service: everything the edge function needs, in one call ─────────────────
create or replace function public.app_sage_dispatch()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_out jsonb;
begin
  select jsonb_build_object(
    'client_id',     c.client_id,
    'client_secret', vs.decrypted_secret,
    'access_token',  va.decrypted_secret,
    'refresh_token', vr.decrypted_secret,
    'access_expires_at', c.access_expires_at,
    'business_id',   c.business_id,
    'scope',         c.scope
  ) into v_out
  from sage_connection c
  left join vault.decrypted_secrets vs on vs.id = c.client_secret_id
  left join vault.decrypted_secrets va on va.id = c.access_secret_id
  left join vault.decrypted_secrets vr on vr.id = c.refresh_secret_id
  where c.id;

  -- Distinct problems deserve distinct sentences on the Admin screen.
  if v_out is null                          then return jsonb_build_object('error','no_row'); end if;
  if v_out->>'client_id' is null            then return jsonb_build_object('error','no_app'); end if;
  if v_out->>'client_secret' is null        then return jsonb_build_object('error','no_client_secret'); end if;
  if v_out->>'refresh_token' is null        then return jsonb_build_object('error','not_connected'); end if;
  return v_out;
end;
$$;

-- ── Service: put the rotated tokens back ─────────────────────────────────────
-- Sage rotates the refresh token on EVERY refresh. If this call does not
-- happen, or happens with the old value, the connection is dead and a human
-- has to sign in again. It is therefore deliberately small and total.
create or replace function public.app_sage_store_tokens(
  p_access text,
  p_refresh text,
  p_access_expires_in integer,          -- seconds, as Sage returns it
  p_refresh_expires_in integer default null,
  p_business_id text default null,
  p_business_name text default null,
  p_connected_by text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare v_a uuid; v_r uuid;
begin
  select access_secret_id, refresh_secret_id into v_a, v_r from sage_connection where id;

  if p_access is not null and length(p_access) > 0 then
    if v_a is null then
      v_a := vault.create_secret(p_access, 'sgas_sage_access', 'Sage access token (short lived)');
      update sage_connection set access_secret_id = v_a where id;
    else
      perform vault.update_secret(v_a, p_access, 'sgas_sage_access', 'Sage access token (short lived)');
    end if;
  end if;

  if p_refresh is not null and length(p_refresh) > 0 then
    if v_r is null then
      v_r := vault.create_secret(p_refresh, 'sgas_sage_refresh', 'Sage refresh token (single use, rotates)');
      update sage_connection set refresh_secret_id = v_r where id;
    else
      perform vault.update_secret(v_r, p_refresh, 'sgas_sage_refresh', 'Sage refresh token (single use, rotates)');
    end if;
  end if;

  update sage_connection
     set access_expires_at  = case when p_access_expires_in is not null
                                   then now() + make_interval(secs => p_access_expires_in) end,
         refresh_expires_at = case when p_refresh_expires_in is not null
                                   then now() + make_interval(secs => p_refresh_expires_in)
                                   else refresh_expires_at end,
         business_id   = coalesce(p_business_id,   business_id),
         business_name = coalesce(p_business_name, business_name),
         connected_at  = coalesce(connected_at, now()),
         connected_by  = coalesce(p_connected_by, connected_by),
         updated_at    = now()
   where id;
end;
$$;

-- ── Service: record how the last sync went ───────────────────────────────────
create or replace function public.app_sage_sync_result(p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  update sage_connection
     set last_sync_at = now(), last_sync_ok = coalesce(p_ok, false),
         last_sync_error = case when p_ok then null else p_error end,
         updated_at = now()
   where id;
end;
$$;

-- ── Service: cache a page of invoices ────────────────────────────────────────
-- Upsert. The match columns are NOT in the update list: a human decision about
-- which booking an invoice belongs to must survive every future sync.
create or replace function public.app_sage_cache_invoices(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_n integer;
begin
  with incoming as (
    select
      r->>'sage_id'                     as sage_id,
      r->>'invoice_number'              as invoice_number,
      r->>'reference'                   as reference,
      r->>'contact_sage_id'             as contact_sage_id,
      r->>'contact_name'                as contact_name,
      nullif(r->>'invoice_date','')::date    as invoice_date,
      nullif(r->>'due_date','')::date        as due_date,
      nullif(r->>'total_amount','')::numeric      as total_amount,
      nullif(r->>'outstanding_amount','')::numeric as outstanding_amount,
      r->>'currency'                    as currency,
      r->>'sage_status'                 as sage_status
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where r->>'sage_id' is not null
  )
  insert into sage_invoice (
    sage_id, invoice_number, reference, contact_sage_id, contact_name,
    invoice_date, due_date, total_amount, outstanding_amount, currency,
    sage_status, fetched_at)
  select sage_id, invoice_number, reference, contact_sage_id, contact_name,
         invoice_date, due_date, total_amount, outstanding_amount, currency,
         sage_status, now()
  from incoming
  on conflict (sage_id) do update set
    invoice_number     = excluded.invoice_number,
    reference          = excluded.reference,
    contact_sage_id    = excluded.contact_sage_id,
    contact_name       = excluded.contact_name,
    invoice_date       = excluded.invoice_date,
    due_date           = excluded.due_date,
    total_amount       = excluded.total_amount,
    outstanding_amount = excluded.outstanding_amount,
    currency           = excluded.currency,
    sage_status        = excluded.sage_status,
    fetched_at         = now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── Service: push what Sage said onto the bookings that are matched ──────────
-- Only matched rows, and only ever from the cache. A booking with no matched
-- invoice keeps whatever a human last set, and keeps saying so.
create or replace function public.app_sage_apply_payments()
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare v_n integer;
begin
  with per_booking as (
    select booking_id,
           sum(total_amount)       as total,
           sum(outstanding_amount) as outstanding
    from sage_invoice
    where booking_id is not null and match_state in ('auto','manual')
    group by booking_id
  )
  update booking b
     set payment_total_amount       = p.total,
         payment_outstanding_amount = p.outstanding,
         payment_state = case
           when p.outstanding is null      then null
           when p.outstanding <= 0         then 'paid'
           when p.outstanding <  p.total   then 'part_paid'
           else 'unpaid' end,
         payment_checked_at = now(),
         payment_source     = 'sage',
         -- keep the screens that still read the old boolean honest
         flag_payment_outstanding = (coalesce(p.outstanding, 0) > 0)
    from per_booking p
   where b.booking_id = p.booking_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
revoke all on function public.app_sage_get(text, text) from public;
revoke all on function public.app_sage_save_app(text, text, text, text) from public;
revoke all on function public.app_sage_disconnect(text, text) from public;
grant execute on function public.app_sage_get(text, text) to anon, authenticated;
grant execute on function public.app_sage_save_app(text, text, text, text) to anon, authenticated;
grant execute on function public.app_sage_disconnect(text, text) to anon, authenticated;

-- Service doors: nobody with the public key may execute these.
revoke all on function public.app_sage_dispatch() from public, anon, authenticated;
revoke all on function public.app_sage_store_tokens(text, text, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.app_sage_sync_result(boolean, text) from public, anon, authenticated;
revoke all on function public.app_sage_cache_invoices(jsonb) from public, anon, authenticated;
revoke all on function public.app_sage_apply_payments() from public, anon, authenticated;
grant execute on function public.app_sage_dispatch() to service_role;
grant execute on function public.app_sage_store_tokens(text, text, integer, integer, text, text, text) to service_role;
grant execute on function public.app_sage_sync_result(boolean, text) to service_role;
grant execute on function public.app_sage_cache_invoices(jsonb) to service_role;
grant execute on function public.app_sage_apply_payments() to service_role;
