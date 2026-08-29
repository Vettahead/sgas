-- ─────────────────────────────────────────────────────────────────────────────
-- THE ANON LOCKDOWN. APPLIED 30 Aug 2026 — Chris ran it by hand in the SQL
-- editor, and the migration history was back-filled to match.
--
-- It closed the largest risk on the project. Before this, all 18 tables carried
-- p_anon_all (ALL / anon / USING true) and 137 grants to `anon`, and the anon
-- key ships inside the JavaScript bundle — so anyone who viewed source could
-- read and write every delegate's name, date of birth, NI number and address.
--
-- VERIFIED AFTER APPLYING, not assumed:
--   anon grants outside app_setting ......... 0
--   tables still on the open policy ......... 0
--   tables on the signed-in policy .......... 18
--   as anon:  select from client ............ permission denied
--   as anon:  select from the view .......... permission denied
--   as a signed-in user: 10 delegates, 19 bookings, 35 sessions, 30 via view
--
-- The emergency undo lives at supabase/rollback/anon_lockdown_EMERGENCY_UNDO.sql.
--
-- DO NOT REVOKE THE LEGACY JWT SECRET. Sign-in tokens are signed with it; the
-- whole app goes down without it. See supabase/README.md.
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
