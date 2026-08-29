-- ─────────────────────────────────────────────────────────────────────────────
-- THE LOCKDOWN. NOT APPLIED. Read all of this before running it.
--
-- This is the migration that closes the hole: it stops the public anon key —
-- which ships inside the JavaScript bundle — reading and writing every
-- delegate, company, booking and staff record. It is kept OUT of
-- supabase/migrations/ on purpose so nothing applies it by accident.
--
-- WHAT IT DOES
--   1. Replaces p_anon_all (ALL / anon+authenticated / USING true) on all 18
--      tables with a policy only a signed-in SGAS user satisfies.
--   2. REVOKEs the table grants from anon. This matters as much as the
--      policies: a GRANT with a permissive policy is wide open, and there are
--      currently 137 grants to anon in the public schema.
--
-- BEFORE RUNNING IT — every one of these must be true:
--   [ ] Vault secret `sgas_jwt_secret` is set to the project's JWT secret
--       (Dashboard → Project Settings → API → JWT Settings → JWT Secret).
--       Until it is, app_login returns token = NULL and this LOCKS EVERYONE OUT.
--   [ ] The build carrying src/lib/session.js is deployed, live, and has been
--       long enough that nobody is still on the previous one.
--   [ ] You have signed OUT and back IN on the live site since that deploy — a
--       token is only issued at login, so an existing session has none.
--   [ ] `select public.app_jwt_secret() is not null;` returns true.
--   [ ] Token expiry is handled. A token lasts 12 hours; when it lapses the
--       browser falls back to anon, which is harmless today but becomes
--       "nothing loads" once this is applied. Add a re-issue path first.
--
-- IF THE SITE GOES DARK: run 2026-08-29_anon_lockdown_ROLLBACK.sql, which puts
-- p_anon_all and the grants back exactly as they were. Keep it to hand.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Refuse to run if the secret is missing. Without this guard the migration
-- succeeds and the business cannot log in.
do $guard$
begin
  if public.app_jwt_secret() is null then
    raise exception 'sgas_jwt_secret is not in Vault — this would lock every user out. See the checklist at the top of this file.';
  end if;
end $guard$;

do $body$
declare t text;
begin
  foreach t in array array[
    'assessor','booking','booking_category','category','chase_log','client',
    'company','course','engagement','engagement_member','holiday','inquiry',
    'mlp','mlp_course','pack','renewal_contact','session','staff_accreditation'
  ] loop
    execute format('drop policy if exists p_anon_all on public.%I', t);

    -- One rule, one place. app_is_signed_in() is true only when the request
    -- carries our own app_user_id claim, so a bare anon key does not qualify.
    execute format($f$
      create policy p_signed_in_all on public.%I
        for all to authenticated
        using (public.app_is_signed_in())
        with check (public.app_is_signed_in())
    $f$, t);

    -- The half that is easy to forget. RLS is not consulted at all when the
    -- GRANT is absent, and the open GRANT is what left this exposed.
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $body$;

-- What anon must keep: a signed-out browser still has to reach the sign-in
-- screen and ask for a reset. These are SECURITY DEFINER, so they work with no
-- table grant at all — which is exactly why they are safe to leave open.
grant execute on function public.app_login(text, text) to anon;

commit;

-- ── prove it, after committing ──────────────────────────────────────────────
--   select count(*) from information_schema.role_table_grants
--    where grantee='anon' and table_schema='public' and table_name<>'app_setting';
--   -- must be 0
--
--   set local role anon; select * from client limit 1; reset role;
--   -- must fail with permission denied
--
--   -- then sign in on the live site and open Delegates.
