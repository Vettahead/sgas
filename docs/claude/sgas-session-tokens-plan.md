# Replacing the JWT with a session token — the plan

**Priority: next session (agreed 30 Aug). Do not let this drift.**

## Why

Sign-in tokens are currently minted in `app_login` and signed HS256 with this
project's **legacy JWT secret**. Supabase has moved to asymmetric signing keys
and still honours the legacy secret for verification, but:

- Legacy `anon` / `service_role` API keys are **deprecated by the end of 2026**
  (Supabase's words). Chris has to migrate off them regardless of this work.
- The anon key IS a JWT signed with the legacy secret, so the natural last step
  of that migration is revoking the secret — and that is the moment sign-in
  breaks for the whole company.

There is no published retirement date for the legacy secret itself (Supabase
calls it "a separate, independent migration"), but the end-of-2026 key deadline
is effectively ours too.

**Failure mode if it happens first:** every request falls back to `anon`, every
table refuses, all screens empty. Recovery is one command —
`supabase/rollback/anon_lockdown_EMERGENCY_UNDO.sql` — which restores anon
access and reopens the leak until this is done. Chris has that SQL saved.

## What was ruled out, and why — do not re-litigate

- **Register our own issuer with Supabase third-party auth.** This would have
  been ideal: sign ES256 with our own key, keep the `role: authenticated` claim,
  and keep BOTH the GRANT layer and the RLS layer. Checked 30 Aug: Supabase
  supports exactly five providers (Clerk, Firebase, Auth0, AWS Cognito, WorkOS)
  and **no custom issuer**. Dead end.
- **Route all 119 `.from()` calls through SECURITY DEFINER RPCs.** Correct, but
  it is a rewrite of the whole data layer for a problem that has a smaller fix.

## The plan

**Verified 30 Aug: PostgREST exposes request headers to SQL.**
`set local request.headers = '{"x-sgas-session":"abc"}'` then
`current_setting('request.headers', true)::json ->> 'x-sgas-session'` returns
`abc`. That is the whole mechanism and it works.

1. **`app_session` table** — `token_hash` (never store the raw token), `user_id`,
   `created_at`, `expires_at`, `revoked_at`, `last_seen_at`. Hash the token so a
   database dump is not a set of live sessions.
2. **`app_login` returns a session token** instead of (or as well as) the JWT.
   Keep returning the JWT during the transition so an old build keeps working.
3. **Browser sends it as a header.** `createClient(url, key, { global: { fetch:
   customFetch } })` where `customFetch` injects `x-sgas-session` from module
   state — dynamic, so no client rebuild on login. `src/lib/session.js` already
   holds the token and is the place to put it.
4. **`app_session_valid()`** reads the header, looks up `app_session`, checks
   `expires_at` and `revoked_at`, and touches `last_seen_at`.
5. **Policies become** `for all to anon, authenticated using
   (public.app_session_valid() or public.app_is_signed_in())`. The `or` keeps
   the JWT path alive during the changeover; drop it once the header path is
   proven live.
6. **Grants back to anon.** This is the trade-off — see below.
7. **`app_is_admin()`** gains the same treatment: resolve the user from the
   session token as well as from the JWT claim.

## The honest trade-off

Today `anon` has **no table grants at all**, so even a policy bug cannot leak
anything — two independent layers. Under the header scheme the request arrives
as `anon`, so the grants must come back and **RLS alone does the enforcing**.

That is the ordinary Supabase model and it is sound, but it is one layer rather
than two, and it is a real reduction from what is in place today. Worth stating
to Chris rather than quietly doing. Mitigation: one shared function
(`app_session_valid`) used by every policy, so there is one thing to get right
rather than eighteen.

## What this gains besides surviving the deprecation

- **Sign out everywhere.** Set `revoked_at` and that session is dead on the next
  request. A JWT cannot be recalled once issued — the current 12-hour token is
  valid until it expires whatever happens to the account.
- **Nothing to keep secret.** No signing key, so no key to leak, rotate or lose.
- **"Who is signed in right now"** becomes answerable, which the current design
  cannot do at all.

## Order of work, so nothing goes dark

1. Table + `app_session_valid()` + `app_login` returning both. Nothing enforces
   it yet. Deploy and confirm the header arrives (add it to the Admin
   "Check this connection" panel).
2. Policies to `session_valid OR jwt`. Both paths work. Deploy, live-check.
3. Once proven: drop the JWT half, remove `app_mint_token`, `app_jwt_secret`,
   the Vault secret, and the "do not revoke the legacy secret" warning in
   `supabase/README.md`.
4. Separately, and after: migrate `anon` → publishable key before end of 2026.
