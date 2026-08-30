---
name: sgas-session-tokens
description: "SGAS sign-in after 30 Aug 2026 — session tokens replaced the self-signed JWT; the pre-request role promotion that kept BOTH security layers, how it fails, and the one setting a restore can lose"
type: project
---

Built 30 Aug 2026, the session after the anon lockdown. Chris: *"whats most
secure?"* then *"lets do it proeprly"* — that answer is why this took the
harder route below rather than the one the plan had written down.

## WHY IT HAD TO HAPPEN
Sign-in tokens were JWTs from `app_mint_token`, signed HS256 with the project's
**legacy JWT secret**. Supabase retires the legacy keys end of 2026, and
revoking that secret would have taken sign-in down for the whole company. A
session token is a row — no signing secret, so nothing left to retire.

Worth knowing: **the app was ALREADY on a publishable key** (`.env` has
`sb_publishable_…`), so the anon-key half of the deprecation was effectively
done. What actually remained was the self-signed JWT. Don't re-panic about the
anon key.

## THE DECISION THAT MATTERS — promote the request, don't reopen the tables
The written plan (`sgas-session-tokens-plan.md`, in this folder) said: grant the
18 tables back to `anon`, let RLS alone enforce, accept going from two layers to
one. Chris asked which was more secure, so it was not done that way.

Instead a **PostgREST `db-pre-request` hook** — `public.app_pre_request` — runs
inside each request's own transaction, resolves the `x-sgas-session` header, and
issues `SET LOCAL ROLE authenticated`. Permitted because the SESSION user is
`authenticator`, which `pg_auth_members` shows is a member of both roles.

So **grants stay revoked from anon and the 18 policies are untouched** — both
barriers from the lockdown survive. Only the means of proof changed.

Proven before building, not after: `authenticator ∈ authenticated` from the
catalog, and `set local role` inside a plpgsql function persists after the
function returns within the transaction (probed with a throwaway schema).

## HOW IT FAILS — closed, always
No token / wrong / expired / revoked / hook errors / hook missing → request stays
`anon` → no grants → every screen empty. **No failure mode of this design opens
data up.** That is the whole reason it was acceptable.

## ★ THE ONE THING A RESTORE CAN LOSE ★
The hook is wired by a ROLE SETTING, not a table:
```sql
alter role authenticator set pgrst.db_pre_request = 'public.app_pre_request';
notify pgrst, 'reload config';
```
Check with `select rolconfig from pg_roles where rolname='authenticator'`.
If it is gone, **every screen is empty for everyone**. `app_promotion_installed()`
detects it and the in-app connection check says so in plain English. Re-apply =
re-run the last two statements of
`supabase/migrations/20260830123705_session_pre_request_promotion.sql`.
To deliberately turn off (back to 29 Aug JWT-only, no data change, no deploy):
`alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`

## BOTH PROOFS ARE LIVE — do not drop the JWT half yet
`app_login` returns `token` (JWT) AND `session_token` + `session_expires`.
`app_user_id()` / `app_role()` / `app_is_signed_in()` / `app_is_admin()` accept
either. `app_whoami().proof` returns `'session' | 'jwt' | 'none'`.
**Watch `proof` for a few days; drop the JWT half only when nobody reports
`jwt`** — then remove `app_mint_token`, `app_jwt_secret`, the `sgas_jwt_secret`
Vault entry, `app_tokens_enabled`, and the README warning section.

## THE FAULT WORTH REMEMBERING
`app_role()` was written SECURITY INVOKER and reads `app_user`, which since the
lockdown is granted to nobody. It threw `permission denied for table app_user`
and **took `app_whoami` down with it** — the one screen people open when things
look broken. Caught in minutes only because `app_whoami` was curled on BOTH
paths after the migration rather than assumed to work.

**Rule: after the lockdown, ANY new function that reads a locked table must be
SECURITY DEFINER. Nothing warns you — not the migration, not the build. Only
calling it does.**

## VERIFY LIVE OVER HTTP, NOT IN THE SQL EDITOR
The SQL editor carries no token and always looks healthy. The real check:
```
no header → 401 · valid token → rows · bogus token → 401
the view → same both ways · app_session itself → 401 even signed in
legacy JWT, no header → rows (nobody locked out)
revoked session → 401 on the very next request
```
CORS was checked first with an OPTIONS preflight: Supabase echoes
`x-sgas-session` back in `access-control-allow-headers`.

## WHAT IT GAINED
- **Sign out everywhere.** `app_session_revoke_all()` is now called by
  `app_password_reset_complete`, `app_set_password` and `app_update_user`
  (on deactivation). Before this, a disabled account kept working up to 12 hours.
  `app_delete_user` needed nothing — `app_session` cascades.
- **"Who is signed in right now"** — `app_active_sessions()`, admin-gated, shown
  by the new **Signed in now** card in Admin → Logins & access. The JWT design
  could not answer this at any price.
- Nothing to keep secret: no signing key to leak, rotate or lose.

## SHAPE
`app_session`: `token_hash` (sha256 of 32 random bytes — the RAW TOKEN IS NEVER
STORED), user_id, created_at, expires_at, revoked_at, last_seen_at, user_agent.
RLS on with no policies AND no grants; everything goes through SECURITY DEFINER
functions. 12-hour life (`app_session_hours()`).
Perf: the hook stashes the resolved id in transaction-local `app.session_user_id`
so the 18 policies do one lookup between them; `app_session_user_id()` falls back
to the table lookup if the GUC is empty, so it is correct with or without the hook.

Frontend: `src/lib/session.js` holds both proofs with their own expiries;
`src/lib/supabase.js` has a custom `fetch` injecting the header from module state
(read fresh per request, so sign-in/out take effect immediately) alongside the
`accessToken` hook for the JWT. `appLogout()` never throws.

## SANDBOX GOTCHA HIT AGAIN
`npm run build` fails on the mount — vite cannot empty `dist/` because
device_bash cannot delete. Build with
`npx vite build --outDir /tmp/sgas-dist --emptyOutDir` instead.

See [[sgas-admin]], [[sgas-deploy-flow]], [[sgas-accounts-and-help]],
[[sgas-mount-write-gotcha]], [[sgas-version-changelog]].
