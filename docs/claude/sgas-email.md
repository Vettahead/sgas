# SGAS email — how it works, and what bit us

Built 28 Aug 2026; the first flows hung off it 29 Aug 2026.

**UPDATE 29 Aug 2026 — it sends, and the wording is Chris's.** The three
trainer notifications are live: put on a course, taken off one, and a course
that has moved. Passwords are proven (all three mailboxes sent on 28 Aug at
21:10). Two things below have changed since the original write-up and are
marked ⬇ where they appear: there is now a **third auth door** (`notify`), and
the wording lives in an **`email_template` table** edited in Admin, not in
code.

## The shape of it

```
Admin → Email settings (EmailSettings.jsx)
        ↓ app_smtp_get / app_smtp_save          [admin-gated RPCs]
   smtp_setting · smtp_mailbox · email_log      [RLS on, ZERO policies]
        ↓ secret_id -->  Supabase Vault          [encrypted at rest]

Anything that sends
        ↓ sendMail()  in src/lib/api.js          [the ONLY way in]
        ↓ Edge Function send-email
        ↓ app_smtp_dispatch(key)                 [service_role ONLY]
        ↓ SMTP  smtp.sgas.co.uk:465 TLS
        ↓ app_email_log_write(...)               [service_role ONLY]
```

Three mailboxes, keyed `crm`, `holidays`, `bookings`. The server and all three
addresses are already filled in; the only thing anyone ever types is a password.

## The rules, and why

- **A password is never returned to a client.** `app_smtp_get` reports
  `password_set: true/false` and nothing else. That is what lets the Admin box
  sit blank for ever after the first save. An empty box means "keep the stored
  one"; `__CLEAR__` removes one. Chris's own instinct, and it was right.
- **Passwords are NOT hashed.** A hash is one-way and SMTP replays the password
  on every send. Hash it and nothing ever sends again. They live in Vault.
- **No `VITE_` prefix, ever.** Vite inlines those into the browser bundle.
- **Secrets are scrubbed from errors.** SMTP libraries quote failed credentials
  back at you; `scrub()` strips them before anything is returned or logged.
- **`verify_jwt` is off on `send-email` on purpose.** This app does not use
  Supabase Auth — everyone shares the anon key, so a JWT proves nothing. The
  real gate is `app_is_admin()` inside the function.
- ⬇ **THIRD DOOR (29 Aug): `notify`, with no credentials at all.** A trainer
  notification fires when somebody drags a name onto a course, and the browser
  keeps nobody's password — `app_login` checks it in the database and returns a
  sanitised row. Rather than hold a password in memory for the convenience of a
  feature, the door was made too narrow to matter: `{notify, session_id}` and
  nothing else. `app_notify_context` (SECURITY DEFINER, service_role only)
  chooses the recipient, the wording, and whether it is switched on. The worst
  an anon caller can do is make a real trainer receive a true statement about a
  real course, at most once per ten minutes (`app_email_recent`, keyed on
  kind + session + recipient + **subject** — so a genuine second move, to
  different dates, still goes out). Weigh that against `p_anon_all`, which lets
  the same key rewrite every delegate record in the system.
- ⬇ **The wording is data (29 Aug).** `email_template` — RLS on, no policies,
  grants revoked from anon/authenticated, edited through admin-gated RPCs and
  Admin → Email → Wording. Placeholders are `{{like_this}}` and an unknown one
  is LEFT STANDING rather than blanked, so a typo shows in the preview instead
  of silently emptying a line. The preview is rendered by the Edge Function
  itself, one step short of the mail server, so it cannot drift from the email —
  it renders what is *stored*, so save before previewing an edit. Scheduled sends (pg_cron)
  will use `SGAS_INTERNAL_SECRET` instead; it is not set yet.
- **Every attempt is logged, delivered or not.** "Did Simon get the warning?"
  has to be answerable without guessing.

## Two gotchas that cost a whole round trip. Do not repeat them.

### 1. You cannot reach the `vault` schema from outside the database

The first version fetched the password with:

```js
db.schema('vault').from('decrypted_secrets')      // NEVER works
```

PostgREST only serves the schemas it is configured to expose — `public` and
`graphql_public`. The request is refused before it reaches the database. It
built, type-checked, deployed, and could not possibly have worked.

Worse: last session's anon-role security probes *passed*. They proved a browser
could not reach the vault and that read as success. **They never asked whether
the server could.** A negative test is not a positive one.

Everything now goes through `app_smtp_dispatch(p_key)` — one RPC in `public`,
`SECURITY DEFINER`, returning host, port, secure, address, username, from_name
and the decrypted password in a single call.

### 2. `revoke ... from public` does NOT cover `anon` and `authenticated`

Supabase's default privileges grant `EXECUTE` to those roles **directly**, so a
revoke aimed at `PUBLIC` leaves them untouched. `app_smtp_dispatch` returns a
plaintext password and was briefly callable by `anon` because of exactly this.

Name the roles, then **check** — do not trust that the statement ran:

```sql
select p.proname,
       has_function_privilege('anon', p.oid, 'execute')         as anon,
       has_function_privilege('service_role', p.oid, 'execute') as svc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'app_smtp%';
```

and then check it again over HTTP with the real anon key, because a
`set local role` test can pass while the deployed grant differs.

### 3. (client side) An Edge Function error arrives stripped of its reason

`supabase-js` turns every non-2xx into `"Edge Function returned a non-2xx status
code"` and puts the actual body on `error.context`. The function had explained
itself perfectly and the explanation was binned. `functionError()` in
`src/lib/api.js` digs it out. **Never call `functions.invoke` directly — use
`sendMail()`,** which already does this.

## What is proved, and what is not

Proved 28 Aug 2026:

- all three secrets decrypt (`vault.decrypted_secrets`, lengths sane)
- `app_smtp_dispatch('crm')` returns a complete config
- `send-email` answers `401 {"ok":false,"error":"Not authorized"}` cleanly with
  no credentials, and with wrong ones
- neither new RPC is callable with the real anon key (`42501 permission denied`)
- **Supabase can reach the mail server**: a throwaway probe opened a TLS socket
  and read `220 smtp2.lhr.stackcp.net ESMTP` from `smtp.sgas.co.uk:465` in
  710ms. So host, port and outbound egress are all sound. (That probe function
  has been emptied but still exists — delete `smtp-probe` in the dashboard.)

~~Not proved: that the three passwords are correct.~~ **Proved 28 Aug 21:10** —
all three mailboxes sent successfully (`email_log` ids 1–3).

Proved 29 Aug 2026, for the notify path:

- the wording unit tests (`tests/wording.mjs`, run under three time zones —
  dates are parsed as UTC on purpose, because `new Date('2026-09-14')` printed
  with `getDate()` in a behind-UTC zone gives the 13th)
- every skip reason comes back cleanly: template off, no trainer, no email on
  the record, no such session, unknown kind
- over HTTP with the real anon key: the notification sends; an arbitrary send
  is `Not authorized`; a preview is `Not authorized`; neither new RPC nor
  `email_template` is reachable
- three real emails sent and logged, against a throwaway trainer and course
  that were deleted afterwards

## The flows

In the order agreed with Chris ("we need to set all of them"):

1. ✅ **BUILT 29 Aug 2026 — and it grew.** Chris asked for all three trainer
   events, not just the one: `trainer_assigned`, `trainer_removed` (so a swap
   tells both people) and `course_moved`. From `crm`. It does NOT fire from the
   screens — it fires from `assignBlockRole()` and `updateBlock()` in
   `api.js`, which is why the calendar, the Schedule board, the setup wizard
   and Assess are all covered by one implementation. Both read the previous
   value BEFORE the write, because afterwards the old trainer and the old dates
   are gone.
2. **Accreditation expiry alerts** + a scheduled job. From `crm`. **This is the
   one with Simon's early-October audit attached** — see
   `sgas-staff-accreditations.md`. Needs pg_cron plus `SGAS_INTERNAL_SECRET`.
3. **Renewal chase**, replacing the `mailto:` on the Dashboard. From `crm`.
4. **Booking confirmation** from `bookings@`. Wording needs agreeing first.

Each one is: compose in `api.js`, call `sendMail({mailbox, to, subject, text,
html, kind, refId})`, and give it a distinct `kind` so `email_log` stays
readable. Nothing else should ever talk to the Edge Function.

## Files

| where | what |
|---|---|
| `src/views/EmailSettings.jsx` | the Admin panel. Write-only password boxes. |
| `src/lib/api.js` | `getSmtpSettings` / `saveSmtpSettings` / `sendMail` / `sendTestEmail` / `listEmailLog` / `functionError` |
| `supabase/migrations/20260828185404_*` | tables |
| `supabase/migrations/20260828185442_*` | admin RPCs |
| `supabase/migrations/20260828185532_*` | revoke table grants |
| `supabase/migrations/20260828211500_*` | `app_smtp_dispatch` / `app_email_log_write` |
| `supabase/functions/send-email/index.ts` | the only thing that decrypts a password |
| `supabase/README.md` | the checks that prove the lock still holds |

## Security notes carried forward

- **`holidays@` and `bookings@` passwords were pasted into a chat** and should
  be reissued. On the board, assigned to Chris.
- **Unrelated but larger:** every table in the SGAS database carries
  `p_anon_all` (ALL, `qual: true`), so the public anon key can read and write
  all delegate, company, booking and staff data. The email tables are the only
  ones locked down. This is the biggest outstanding risk on the project.
