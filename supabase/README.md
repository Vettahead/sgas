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

## The anon lockdown — where it has got to (29 Aug 2026)

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

**What is left — and it needs Chris.** The token is NULL until the project's JWT
secret is in Vault, and that value must never go through a chat. In the SQL
editor, paste your own value:

```sql
select vault.create_secret('PASTE_THE_JWT_SECRET_HERE', 'sgas_jwt_secret',
                           'Signs the app_login JWT');
-- then check, without printing it:
select public.app_jwt_secret() is not null;   -- must be true
```

It is at **Dashboard → Project Settings → API → JWT Settings → JWT Secret**.

Then, and only then, work through the checklist at the top of
`supabase/pending/2026-08-29_anon_lockdown.sql` and run it. Keep
`..._ROLLBACK.sql` open in a tab while you do.

**One gap still to close before the flip:** a token lasts 12 hours, and when it
lapses the browser silently drops back to anon. That is harmless today; after
the lockdown it means "nothing loads". Add a re-issue path first.
