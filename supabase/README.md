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

### Verifying the lock still holds

Run as the `anon` role — every one of these must be refused:

```sql
set local role anon;
select * from public.smtp_mailbox;          -- permission denied
select * from vault.decrypted_secrets;      -- permission denied
update public.smtp_mailbox set username='x'; -- permission denied
select public.app_smtp_get('admin','wrong'); -- Not authorized
```
