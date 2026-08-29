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
--   [ ] Vault secret `sgas_jwt_secret` is set to the project's LEGACY JWT
--       secret (Dashboard → Project Settings → JWT Keys → the legacy secret;
--       the old API → JWT Settings path is gone). Until it is, app_login
--       returns token = NULL and this LOCKS EVERYONE OUT.
--   [ ] THE ONE THAT CAN CATCH YOU OUT: this project has already migrated to
--       asymmetric JWT signing keys — its JWKS endpoint serves an ES256 key —
--       while app_mint_token signs HS256 with the legacy shared secret.
--       Supabase keeps honouring the legacy secret until the legacy key is
--       REVOKED. Checked 30 Aug 2026: NOT revoked — the dashboard says the
--       legacy secret "is used to only verify JSON Web Tokens", which is
--       exactly what our tokens need. AFTERWARDS IT MUST STAY THAT WAY:
--       revoking it, or switching to publishable/secret API keys in order to
--       disable the legacy keys, takes the whole app down. See supabase/README.
--       DO NOT REASON ABOUT THIS — measure it. Sign in to the live app and
--       press Admin → Logins & access → "Check this session". It must say
--       SAFE TO LOCK DOWN. The SQL editor cannot answer this: it carries no
--       token and always looks healthy.
--   [ ] The build carrying src/lib/session.js is deployed, live, and has been
--       long enough that nobody is still on the previous one.
--   [ ] You have signed OUT and back IN on the live site since that deploy — a
--       token is only issued at login, so an existing session has none.
--   [ ] `select public.app_jwt_secret() is not null;` returns true.
--   [x] Token expiry is handled. DONE 30 Aug: App.jsx signs the person out and
--       says "Your session has ended" when tokens are being issued and theirs
--       has gone, instead of leaving them looking signed in with empty screens.
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

-- ── the back door: the view ─────────────────────────────────────────────────
-- v_live_qualification exposes every delegate's name, email, mobile, employer
-- and qualification expiries. A VIEW HAS NO POLICIES OF ITS OWN, and without
-- security_invoker it runs with its owner's rights — so it reads straight past
-- every policy set above. Locking the tables and leaving this is no lockdown at
-- all. security_invoker makes it obey the caller's policies instead, which is
-- what everyone assumes a view does anyway.
alter view public.v_live_qualification set (security_invoker = true);
revoke all on public.v_live_qualification from anon;
grant select on public.v_live_qualification to authenticated;

-- What anon must keep: a signed-out browser still has to reach the sign-in
-- screen and ask for a reset. These are SECURITY DEFINER, so they work with no
-- table grant at all — which is exactly why they are safe to leave open.
-- app_setting also stays readable; checked 30 Aug, it holds only the app URL
-- and which staff id approves holidays.
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
