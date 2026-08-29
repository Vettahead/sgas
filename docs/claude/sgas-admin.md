# SGAS Admin screen

Rebuilt 29 Aug 2026. `src/views/Admin.jsx`, three tabs: **Staff · Logins &
access · Email**. Chris: *"make the admin page clean and easy to use, fully
tabbed so it's not one big page."*

## The bug worth remembering

`unlock()` wrapped `load()` in try/catch — but `load()` ends
`catch (e) { toast(e.message) }` and never rethrows. So the catch was
unreachable and **a wrong password unlocked the page anyway**, onto a screen
where every call then failed. Chris saw an empty staff list and an Email card
saying only "Password incorrect", and concluded the email work had broken it.
It hadn't: `app_list_users` — untouched for weeks — was 400ing in the same
second as `app_smtp_get`.

Two rules out of it:

- **A helper that swallows its own errors cannot be used as a check.**
- **One message for three causes sends people the wrong way.** Wrong password /
  not an admin / server unreachable now read differently.

Diagnosis route worth reusing: Supabase MCP `query_logs` over `edge_logs`
filtered to `rpc/app_*` gives status per call per browser, and `postgres_logs`
gives the raised message. That is what proved it was old code, not new.

## Delete = left, for staff

Chris's spec, verbatim: *"all legacy items they taught and their file stay in
place, just they get removed from staff unless you click a checkbox to show left
staff. In courses and calendar all that stays the same, they're legacy and will
be needed. If in the future, say they leave and there's a course next week, it
flags in the cal system that this now needs a trainer — it doesn't lock on those
ones."*

- `assessor.left_on` (date). Set = gone from `listStaff()`, which is the ONE
  function every trainer/assessor/verifier picker reads, so one change removes
  them everywhere. `listStaff({ includeLeft: true })` backs the "Show past
  staff" tick; Reinstate clears the date.
- Nothing they have taught changes. `session` and `booking` reference `assessor`
  with `NO ACTION`, so the database itself refuses a real delete for anyone with
  history. That is the guarantee — not a check in the UI.
- `block()` computes **`trainerGone`** = the trainer has left AND the course has
  not finished. It feeds `ready`, the dashboard's `missing` line and the
  calendar's Needs attention. A finished course keeps its trainer and stays
  ready.
- A record with no history at all — the four seed staff — is offered as a real
  delete.

## Delete = delete, for logins

`app_delete_user`; nothing in the database references `app_user`. Guards: never
the account you are signed in as, never the last active admin (defensive rather
than reachable — the caller must itself be an active admin).

## Layout rule, again

The staff table went from eight columns to six by moving username, role and
status to the accounts tab. Per-person detail stays on the person's own page
behind their name. No new CSS: `.seg-tabs` with `.btn sm` / `.btn sm ghost`, the
same pattern the Schedule screen uses.

## Still to do

- The same treatment on **delegates**.
- The **"Keith Rinmer" spelling** — the typo record holds the login; the
  correctly spelled duplicate has none.

See [sgas-ui-conventions](sgas-ui-conventions.md),
[sgas-staff-accreditations](sgas-staff-accreditations.md),
[sgas-email](sgas-email.md), [sgas-deploy-flow](sgas-deploy-flow.md).
