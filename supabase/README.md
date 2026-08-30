# Supabase: migrations and functions

Schema changes for SGAS have historically been applied straight to the database
and never kept here, which meant the only way to see what an RPC does was to
query `pg_get_functiondef`. Anything that touches credentials should be
reviewable in git, so from 28 Aug 2026 the SQL lives here too.

`migrations/` mirrors `supabase_migrations.schema_migrations`. The filenames are
the applied `version` values, so the two can be compared:

```sql
select version, name from supabase_migrations.schema_migrations order by version desc;
```

## The email plumbing (28 Aug 2026)

| file | what it does |
|---|---|
| `20260828185404_smtp_settings_and_email_log.sql` | `smtp_setting`, `smtp_mailbox`, `email_log`. RLS on, **no policies**. |
| `20260828185442_smtp_settings_rpcs.sql` | `app_smtp_get` / `app_smtp_save` / `app_email_log`, gated by `app_is_admin()`. |
| `20260828185532_smtp_tables_revoke_client_grants.sql` | Revokes the table grants from `anon`/`authenticated` as a second lock. |
| `20260828211500_smtp_dispatch_rpcs.sql` | `app_smtp_dispatch` / `app_email_log_write`, **service_role only**. The send path. |
| `functions/send-email/index.ts` | The only thing that decrypts an SMTP password. |

### The rules these encode

- **A password is never returned to a client.** `app_smtp_get` reports
  `password_set: true/false`. That is what lets the Admin box sit blank.
- **Passwords are not hashed** — a hash is one-way and SMTP needs the password
  replayed on every send. They go in Supabase Vault, encrypted at rest.
- **Two locks, not one.** RLS-with-no-policies *and* revoked grants. Every other
  table in this database carries `p_anon_all` (ALL, `qual: true`), so the public
  anon key is effectively a full read/write key to the rest of the schema — a
  single accidental policy on these tables would otherwise expose them.
- **`verify_jwt` is off on `send-email` on purpose.** This app does not use
  Supabase Auth; everyone shares the anon key, so a JWT proves nothing. The real
  gate is the `app_is_admin()` check inside the function.
- **Secrets are scrubbed from errors.** SMTP libraries quote failed credentials
  back at you; the function strips them before returning anything.
- **The server reaches the vault through `public`, never across schemas.**
  PostgREST only serves `public` and `graphql_public`, so
  `db.schema('vault').from('decrypted_secrets')` is refused before it reaches
  the database. It looked right, type-checked, built, deployed, and could never
  have worked. `app_smtp_dispatch()` is the door.
- **`revoke ... from public` does NOT cover `anon` and `authenticated`.**
  Supabase's default privileges grant them `EXECUTE` directly, so those grants
  survive. `app_smtp_dispatch` returns a plaintext password and was briefly
  callable by `anon` because of exactly this. Name the roles, then *check*:

  ```sql
  select p.proname,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('service_role', p.oid, 'execute') as svc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'app_smtp%';
  ```

### Verifying the lock still holds

Run as the `anon` role — every one of these must be refused:

```sql
set local role anon;
select * from public.smtp_mailbox;          -- permission denied
select * from vault.decrypted_secrets;      -- permission denied
update public.smtp_mailbox set username='x'; -- permission denied
select public.app_smtp_get('admin','wrong'); -- Not authorized
select public.app_smtp_dispatch('crm');     -- permission denied
```

And over HTTP with the real anon key, which is the check that actually matters —
a `set local role` test can pass while the deployed grant differs:

```bash
curl -s -X POST "$URL/rest/v1/rpc/app_smtp_dispatch" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_key":"crm"}'
# {"code":"42501", ... "permission denied for function app_smtp_dispatch"}

curl -s -X POST "$URL/functions/v1/send-email" \
  -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
  -d '{"to":"x@example.com"}'
# 401 {"ok":false,"error":"Not authorized"}
```

### Is the mail server reachable from Supabase?

It is — checked 28 Aug 2026 with a throwaway probe function that opened a TLS
socket and read the greeting, sending nothing and using no credentials:

```
smtp.sgas.co.uk:465 TLS -> 220 smtp2.lhr.stackcp.net ESMTP   (710ms)
```

Worth repeating if a send ever fails with a timeout rather than a refusal, since
it separates "the network is blocked" from "the password is wrong".

### Can anon reach the notification path? (added 29 Aug 2026)

`app_notify_context` and `app_email_recent` are `service_role` only — they are
called by the Edge Function and by nothing else. `app_notify_context` hands back
a staff email address and the composed wording, so it must stay that way.

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')         as anon,
       has_function_privilege('service_role', p.oid, 'execute') as svc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('app_notify_context','app_email_recent');
-- both: anon = false, svc = true
```

And over HTTP with the real anon key — PostgREST reports a function it cannot
see as *not found* (`PGRST202`), which is the answer you want here:

```bash
curl -s -X POST "$URL/rest/v1/rpc/app_notify_context" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_kind":"trainer_assigned","p_session_id":1}'
# {"code":"PGRST202", ...}

curl -s "$URL/rest/v1/email_template?select=*" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# {"code":"42501", ... "permission denied for table email_template"}
```

The notification path itself is open by design and should stay working:

```bash
curl -s -X POST "$URL/functions/v1/send-email" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"notify":"trainer_assigned","session_id":<a real one>}'
# {"ok":true,"sent":true,...}  — or {"ok":true,"sent":false,"skipped":"..."}

# but an arbitrary send, and a preview, still are not:
curl -s -X POST "$URL/functions/v1/send-email" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" \
  -d '{"to":"x@example.com","subject":"nope","text":"nope"}'
# 401 {"ok":false,"error":"Not authorized"}
```

Use a session whose trainer is a throwaway record when testing, and delete it
afterwards — a real send goes to a real person.

## ⚠ DO NOT REVOKE THE LEGACY JWT SECRET — *downgraded 30 Aug 2026, see below*

> **Status as of 30 Aug 2026 (afternoon):** still true, but no longer permanent.
> Session tokens now exist alongside the JWT and need no signing secret at all
> (see **Session tokens** at the end of this file). Once every browser has signed
> in once on the new path, the JWT half comes out and this whole section can be
> deleted. Until then the warning below stands unchanged, because a browser that
> has not signed in since this morning is still carrying a JWT.

**Revoking it today takes the whole app down.** Not degraded — down. Nobody who
has not yet signed in on the new path can load any screen.

Sign-in tokens are signed HS256 with this project's **legacy JWT secret**. The
project has already migrated to asymmetric signing keys, so new Supabase-issued
tokens use ES256, but the legacy secret is still accepted for **verification** —
confirmed in the dashboard 30 Aug 2026: *"It is used to only verify JSON Web
Tokens by Supabase products."* That verification is the only reason our tokens
work.

The dashboard actively invites the change that would break it:

> "Legacy JWT secret can only be changed by rotating to a standby key and then
> revoking it. This includes the `anon` and `service_role` JWT based API keys.
> **Consider switching to publishable and secret API keys to disable them.**"

So the two things that must not happen while sign-in works this way:

1. Do not rotate the legacy key to standby and revoke it.
2. Do not switch to publishable/secret API keys *in order to disable the legacy
   JWT keys* — that is the same thing by another route.

Neither is urgent for SGAS and neither buys anything today. If either becomes
necessary, the session design has to be replaced first — see below.

**The durable replacement, when it is wanted:** stop minting JWTs and put a
session token in a request header instead, validated by the policies against an
`app_session` table. No signing secret, immune to anything Supabase does with
keys, and it gains real "sign this person out everywhere", which a JWT cannot
do. Roughly half a session's work. It is the right answer eventually; it was not
worth blocking the lockdown on.

## The anon lockdown — DONE (30 Aug 2026)

**The problem.** This app does not use Supabase Auth, so every request reached
Postgres as `anon` whether somebody was signed in or not. The only way to make
that work was `p_anon_all` (ALL / anon / USING true) on all 18 tables, plus 137
table grants to `anon`. The anon key ships inside the JavaScript bundle and is
therefore public — so anyone who viewed source could read and write every
delegate's name, date of birth, NI number and address. This is the largest
outstanding risk on the project.

**What is done.** `app_login` now mints a JWT (migration
`20260829234500_app_session_jwt.sql`) carrying `role: authenticated` plus
`app_user_id` / `app_role` claims, and `src/lib/session.js` hands it to every
request through supabase-js's `accessToken` hook. **Nothing is locked down
yet** — the policies still allow anon exactly as before, so no token, an expired
token and an older build all behave as they did. The mechanism was proved on a
throwaway table: anon → `permission denied`, a token without our claims → 0
rows, a signed-in SGAS user → the row.

**APPLIED 30 Aug 2026** and verified from both sides: as anon, every table and
the reporting view refuse; signed in, 10 delegates / 19 bookings / 35 sessions
are all there. 0 anon grants remain outside `app_setting`. Chris ran it by hand,
so the migration history was back-filled. Emergency undo:
`supabase/rollback/anon_lockdown_EMERGENCY_UNDO.sql`.

The secret was set like this, for reference — the value never goes through a
chat:

```sql
select vault.create_secret('PASTE_THE_JWT_SECRET_HERE', 'sgas_jwt_secret',
                           'Signs the app_login JWT');
-- then check, without printing it:
select public.app_jwt_secret() is not null;   -- must be true
```

It is at **Dashboard → Project Settings → API → JWT Settings → JWT Secret**.

**The one gap that WAS closed first**, and had to be: a token lasts 12 hours,
but being signed in was remembered forever. `app_tokens_enabled()` plus the
guard in App.jsx now end the session when the token ends and say so, instead of
leaving somebody looking signed in with empty screens.

**The check that must be run from the BROWSER, never the SQL editor:**
Admin → Logins & access → "Check this session". It reports the role the request
actually arrives as. The SQL editor carries no token and always looks healthy —
which is exactly how you would talk yourself into a lockdown that fails.

## Session tokens (30 Aug 2026) — the replacement for the JWT

**What changed.** `app_login` now also issues a **session token**: 32 random
bytes, returned once, stored only as a SHA-256 hash in `app_session`. The
browser sends it on every request as `x-sgas-session`, and the database looks it
up. There is no signing secret anywhere in that sentence, which is the entire
point — nothing to retire, nothing to rotate, nothing to leak.

**Both proofs are live at once.** The JWT still works. A browser running
yesterday's build is not locked out, and nothing had to be deployed in lockstep
with the migrations. Admin → Logins & access → *Check this connection* reports
which proof the current browser used (`session` or `jwt`).

**The eight migrations**, in order:

| file | what it does |
|---|---|
| `…123228_app_session_table_and_validator.sql` | `app_session`, `app_session_token()`, `app_session_user_id()`, `app_session_valid()`. Nothing enforces it yet. |
| `…123255_app_login_issues_session_token.sql` | `app_session_issue()`, `app_logout()`, `app_session_revoke_all()`. |
| `…123342_identity_accepts_session_or_jwt.sql` | `app_user_id()` / `app_role()` / `app_is_signed_in()` / `app_is_admin()` accept either proof. |
| `…123414_app_login_returns_session_expiry.sql` | The server tells the browser when its session ends. |
| `…123705_session_pre_request_promotion.sql` | **The important one.** The pre-request hook. Read its header. |
| `…123906_whoami_reports_session_and_promotion.sql` | `app_whoami()` gains `proof` and `promotion_installed`; `app_active_sessions()`. |
| `…123935_app_role_must_be_security_definer.sql` | Fixes a fault introduced an hour earlier — see below. |
| `…124216_changing_a_password_ends_the_sessions.sql` | Password change / reset / disable now actually put people out. |

### Why the request is *promoted* rather than the tables reopened

The obvious way to make session tokens work is to grant the eighteen tables back
to `anon` and let RLS do all the deciding. That works, it is ordinary Supabase
practice — and **it would undo half of the lockdown.** Today there are two
independent barriers: `anon` holds no GRANT at all, so Postgres refuses before
RLS is consulted, and the policies on top. Granting anon back leaves one.

So instead a PostgREST `db-pre-request` hook (`public.app_pre_request`) runs
inside each request's own transaction, resolves the session token, and issues
`SET LOCAL ROLE authenticated`. That is permitted because the *session* user is
`authenticator`, which is a member of both roles. Grants stay revoked, the
eighteen policies are untouched, and only the means of proof has changed.

**It fails closed.** No token, a wrong token, an expired or revoked one, a hook
that errors, or a hook a platform restore dropped — every one of those leaves the
request as `anon`, which holds no grants, so screens come back empty. There is no
failure mode of this design that opens data up.

**The one thing that can go missing.** The hook is wired by a role setting, not
by a table, so a platform restore can lose it:

```sql
select rolconfig from pg_roles where rolname = 'authenticator';
-- expect pgrst.db_pre_request=public.app_pre_request
```

If it is gone, every screen is empty for everyone. The in-app connection check
says so in plain English. Re-apply by re-running the last two statements of
`…123705_session_pre_request_promotion.sql`. To turn it off deliberately —
returning the system to the JWT-only behaviour of 29 Aug, with no data change and
no deploy:

```sql
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

### Verified live over HTTP, 30 Aug 2026

Not `set local role` in the SQL editor — the real endpoint with the real
publishable key, which is the only check that counts:

```
no session header      -> 401 permission denied for table client
valid session header   -> 200 rows
bogus session header   -> 401 permission denied
the reporting view     -> same, both ways
app_session itself     -> 401 even when signed in
legacy JWT, no header  -> 200 rows        (nobody is locked out)
revoked session        -> 401 on the very next request
```

### What this buys besides surviving the deprecation

- **Sign out everywhere.** `revoked_at` and the session is dead on the next
  request. Changing or resetting a password, and disabling an account, now do
  this — previously a disabled account kept working for up to twelve hours,
  because a JWT already issued could not be recalled.
- **"Who is signed in right now"**, in Admin → Logins & access. The JWT design
  could not answer this at any price: it issued tokens and forgot them.
- **Nothing to keep secret.** No signing key to leak, rotate or lose.

### The mistake worth keeping

`app_role()` was written SECURITY INVOKER and had to read `app_user`, which since
the lockdown is granted to nobody. It threw `permission denied for table
app_user` and took `app_whoami` with it — the one screen people open when things
look broken. Caught within minutes only because `app_whoami` was curled on both
paths after the migration rather than assumed to work.

**The rule that falls out of it:** after the lockdown, any new function that
reads a locked table must be SECURITY DEFINER, and nothing will tell you it
isn't — not the migration, not the build. Only calling it will.

### Still to do

1. Watch `app_whoami().proof` over the next few days. Once nobody reports `jwt`,
   drop the JWT half: `app_mint_token`, `app_jwt_secret`, the `sgas_jwt_secret`
   Vault entry, `app_tokens_enabled`, and the warning section above.
2. Separately, and after that: the app is already on a publishable key
   (`sb_publishable_…`), so the anon-key half of the end-of-2026 deprecation is
   effectively done. Confirm and close it off.
