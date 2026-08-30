-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION TOKENS, PART 4 — how a session token earns the `authenticated` role.
--   ★ THIS IS THE ONE THAT CAN GO MISSING. READ THE RECOVERY NOTE BELOW. ★
--
-- WHY THIS EXISTS AT ALL, because it is the least obvious decision on the
-- project. The straightforward way to make session tokens work is to grant the
-- tables back to `anon` and let the policies do all the deciding. That works, it
-- is ordinary Supabase practice — and it would undo half of the 29 Aug lockdown.
-- Today there are TWO independent barriers: `anon` holds no GRANT on any of the
-- eighteen tables, so Postgres refuses before RLS is even consulted, and the
-- policies on top. Granting anon back leaves one.
--
-- So instead the request is promoted. PostgREST runs `db-pre-request` inside the
-- request's own transaction, after switching to `anon`; from there
-- `SET LOCAL ROLE authenticated` is permitted because the SESSION user is
-- `authenticator`, which is a member of both. Grants stay revoked from anon, the
-- eighteen policies stay exactly as they were written, and the only thing that
-- changed is how a request proves itself.
--
-- HOW IT FAILS — it fails CLOSED, and that is the whole reason it is acceptable.
-- No token, a wrong token, an expired or revoked one, a hook that errors, or a
-- hook that a platform restore quietly dropped: all of them leave the request as
-- `anon`, which holds no grants, so every screen comes back empty. Loud and
-- harmless. There is no failure of this design that opens data up.
--
-- ── IF SCREENS GO EMPTY FOR EVERYONE AT ONCE ────────────────────────────────
-- The setting below is the one piece of this that lives in role config rather
-- than in a table, so it is the one piece a platform restore can lose. Check:
--
--   select rolconfig from pg_roles where rolname = 'authenticator';
--   -- expect a pgrst.db_pre_request=public.app_pre_request entry
--
-- Missing? Re-run the last two statements of this file. The in-app Admin →
-- Logins & access → "Check this connection" button says this in plain English,
-- so nobody has to remember the query.
--
-- To turn it OFF (returns the system to the JWT-only behaviour of 29 Aug, with
-- no data change and no deploy):
--
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
-- ─────────────────────────────────────────────────────────────────────────────

-- Best-effort "this session was used". Not security, just so the admin screen
-- can say who is actually signed in. SECURITY DEFINER because by the time this
-- runs the caller has no business reading app_session directly.
create or replace function public.app_session_touch()
returns void language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare v_token text := public.app_session_token();
begin
  if v_token is null then return; end if;
  -- Only every few minutes: this is bookkeeping, and it must not turn every
  -- write request into a second write.
  update public.app_session
     set last_seen_at = now()
   where token_hash = encode(digest(v_token, 'sha256'), 'hex')
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end $$;
grant execute on function public.app_session_touch() to anon, authenticated;

-- The hook itself. SECURITY INVOKER on purpose: the role switch is permitted
-- because of who the SESSION user is (`authenticator`), and a SECURITY DEFINER
-- wrapper would change that footing for no gain.
create or replace function public.app_pre_request()
returns void language plpgsql volatile
set search_path = public
as $$
declare v_id bigint;
begin
  -- ── the part that matters ────────────────────────────────────────────────
  -- Guarded so that no fault in here can ever 500 a request. The worst this
  -- block can do is decline to promote, which leaves the caller as `anon`.
  begin
    v_id := public.app_session_user_id();

    if v_id is not null then
      -- Resolved once, here, and left where the eighteen policies can read it
      -- without going back to the table each. is_local = true, so it dies with
      -- the transaction and cannot survive onto the next request sharing this
      -- pooled connection.
      perform set_config('app.session_user_id', v_id::text, true);
      set local role authenticated;
    end if;
  exception when others then
    v_id := null;
  end;

  -- ── bookkeeping, kept well away from the part that matters ───────────────
  -- Its own block, AFTER the promotion, so that a failure here — a read-only
  -- transaction on a GET, most likely — rolls back only itself and leaves the
  -- caller promoted.
  begin
    if v_id is not null and current_setting('transaction_read_only') = 'off' then
      perform public.app_session_touch();
    end if;
  exception when others then
    null;
  end;
end $$;

grant execute on function public.app_pre_request() to anon, authenticated, service_role;

-- ── the wiring. These two lines are the ones a restore can lose. ────────────
alter role authenticator set pgrst.db_pre_request = 'public.app_pre_request';
notify pgrst, 'reload config';
