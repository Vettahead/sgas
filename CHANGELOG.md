# Changelog

All notable changes to the SGAS Training Management frontend.
Newest first. The in-app Changelog screen (Settings → Changelog) shows the same
releases in plain English for the client; this file carries the technical detail.

## 2026-08-30 — The anon lockdown, applied

The largest risk on the project, closed. Every table carried `p_anon_all`
(ALL / anon / USING true) plus 137 grants to `anon`, and the anon key ships in
the JS bundle — so viewing source got you read/write on every delegate's name,
DOB, NI number and address.

### Why it took two halves

RLS alone was never going to do it. A policy cannot restrict a role that holds
an open GRANT, and a GRANT is not consulted at all once RLS denies — both had to
change together. 137 grants revoked, 18 policies replaced.

### The one that nearly got away

`v_live_qualification` — forename, surname, email, mobile, employer, expiries.
A view has no policies of its own, and without `security_invoker` it runs with
its OWNER's rights, reading straight past every policy on the tables beneath it.
Locking 18 tables and leaving that view would have been no lockdown at all.
Caught by listing what `anon` could still reach rather than trusting the
migration, and only because Chris asked to be walked through step 4 again.

### The trap underneath all of it

This project has already migrated to asymmetric JWT signing keys (its JWKS
endpoint serves ES256), while `app_mint_token` signs HS256 with the legacy
shared secret. Supabase honours the legacy secret only until the legacy key is
**revoked** — and the dashboard actively invites revoking it ("consider
switching to publishable and secret API keys to disable them"). Doing so takes
the whole app down. `app_whoami()` + the "Check this session" button in Admin
exist so this is measured from the browser rather than reasoned about; the SQL
editor carries no token and always looks healthy, which is the trap.

**The durable fix, not done:** drop the JWT for a session token in a request
header validated by the policies against an `app_session` table. No signing
secret, immune to Supabase key changes, and it gains sign-out-everywhere.

### Verified after applying, not assumed

| check | result |
|---|---|
| anon grants outside `app_setting` | 0 |
| tables still on `p_anon_all` | 0 |
| tables on `p_signed_in_all` | 18 |
| as anon: `select from client` | permission denied |
| as anon: `select from v_live_qualification` | permission denied |
| as a signed-in user | 10 delegates, 19 bookings, 35 sessions, 30 via view |

Applied by hand in the SQL editor, so `supabase_migrations.schema_migrations`
was back-filled — otherwise the next `db push` meets a schema the repo cannot
explain, and re-running would fail on the existing policies.

## 2026-08-29 — The June history, rebuilt from the commits

The in-app Changelog screen (`src/lib/version.js`) had 7 entries for the 104
commits up to 29 Jun, and 23 for the 38 after 27 Aug. June was reconstructed by
reading the diffs — the commit messages from that era ("dels", "block gap",
"cc") carry nothing.

**Three things the old entries got wrong, all found by reading the code rather
than the messages:**

- The calendar was written on **27 Jun**, not 28 — `src/views/Calendar.jsx`
  appears at build 54 and is reworked twice the same day. 1.4.0 (28 Jun) was
  claiming it. Now 1.2.2.
- "engagement system" is **personal diary entries** (`listEngagements` /
  `createEngagement`, title + date + time, owned by a user), not managed
  learning programmes. Nearly written up as the latter.
- "email chain and logs" is the **renewal chase log**
  (`recordRenewalContact` / `getRenewalContacts`), not an email feature.

**Build numbers rederived.** Every one was an estimate and most had drifted —
1.2.0 was labelled build 52, which is a 27 Jun commit. Also fixed at the
27/28 Aug boundary: 1.6.0 was on 105 (the 17 Jul docs import), 1.8.0 was dated
27 Aug for work committed on the 28th. All 32 now verified against
`git rev-list --count`, with a script in the commit message's session.

**0.1.0 is the one deliberate mismatch** and now carries a comment saying so:
the system went live 7 Jun, this repo starts 10 Jun ("update to git desktop"),
so build 1 is not a 7 Jun commit and never will be.

New entries: 1.2.1 (drag-and-drop board), 1.2.2 (the calendar), 1.3.1 (diary and
daily tasks), plus additions to 1.0.0 and 1.2.0.

## 2026-08-29 — The logo, and the only image there will ever be

`public/email-logo.png` (a copy of `src/assets/sgas-logo-white.png` — the
bundled asset gets a content hash, so it has no stable URL an inbox can fetch)
served from the site root and referenced absolutely by `LOGO` in `layout.ts`.
**Change that constant if the site ever moves to its own domain.**

The rule stays "nothing the email has to SAY may live in a picture". The logo
qualifies because it says nothing: `alt="SGAS"` is styled white/700/20px so a
blocked image renders as the wordmark the header carried before, and the
strapline is live text either way. No `height` attribute — reserving the image's
height left a hole above the strapline when it did not load. `tests/layout.mjs`
now asserts exactly one `<img>`, absolute src, and that alt text.

Verified both states by screenshotting with Playwright and `page.route()` —
once fulfilling the logo request from disk, once aborting it.

**Edge Function v9.** The logo only resolves once the site is deployed; until
then recipients see the alt-text header.

## 2026-08-29 — The emails get a layout

Plain-text emails were going out looking like a printout. Every send now carries
an HTML alternative as well, built by `supabase/functions/send-email/layout.ts`.

### The constraint that decided the design

The wording is edited by Chris in a textarea in Admin → Email → Wording. He must
never have to type a tag, and templates already in the database must keep
working untouched. So the templates stay plain text and `layout.ts` infers the
structure from the SHAPE of the text — the shape a person types anyway:

| what is typed | what it becomes |
|---|---|
| blank line | new paragraph |
| `  When:  Mon 14 Sep` (indented, `Label: value`) | a row in the details panel |
| paragraph OPENING in capitals | amber callout |
| a line that is only a URL | a button |
| `SGAS Training Management` on its own | dropped — the footer says it |

Two traps that cost a test each: a sentence containing a colon ("One thing:
bring ID") must not become a detail row, which is why the label regex demands
two spaces of indent; and the shout detector matches the OPENING of a paragraph,
not a whole line, because "PLEASE BRING PHOTOGRAPHIC ID. Without it we cannot
assess you." is mostly lowercase.

Detail blocks separated only by a blank line are merged into ONE table. Two
tables meant two label columns of different widths stacked on top of each other,
which looked like a bug. Caught by screenshotting the output, not by a test.

### Email HTML is not web HTML

600px, tables with `role="presentation"`, every style inline, web-safe font
stack, `color-scheme` meta plus a `prefers-color-scheme` block, a hidden
preheader, and **no images at all** — most clients block them by default and a
blocked image is a broken email. Outlook renders through the Word engine; Gmail
strips `<link>` and clips above 102KB (the largest template renders at ~6KB).

### Where it is wired

Inside `deliver()` in `index.ts`, so every path gets it for the price of one
line: `html: d.html ?? (d.text ? toHtml(d.text, subject) : undefined)`. A caller
that built its own HTML keeps it. The plain text is still sent exactly as typed
— it is what a text-only client, a screen reader and the Sent log show.

`tests/layout.mjs` — 10 groups, including escaping (`<script>` never reaches the
inbox as markup), the colon trap, and the Gmail clip threshold.
`scripts/preview-emails.mjs` writes four rendered samples to `/tmp/sgas-emails/`
for screenshotting; **look at them before shipping** — that is what caught the
double table and the over-bolded callout.

**Edge Function v8.** Deployed from the repo files, so the note below about the
deployed copy having trimmed comments is now closed: deployed and repo match.

## 2026-08-29 — The first emails that leave the building

Every email so far went to staff. Delegates now get four, from `bookings@`.

### The trigger, and why not the other one

A booking can exist before it has dates — reception takes it into the waiting
pool and it is scheduled later. So "you are booked" and "here are your dates"
are two different moments, and only the second is worth an email. "We have you
down, we will let you know when" generates the phone call it is meant to
prevent. `booking_confirmed` fires when a delegate is actually placed on a
course — from `addDelegatesToBlock` and `scheduleCourse`, not from the booking
screen.

The other three: `booking_moved` (the course they are on changes dates),
`booking_rescheduled` (they are moved onto a different one), `booking_cancelled`
(their place is released back to the waiting list).

### Two schema things that were waiting for this

`booking.confirmation_sent_at` has existed since the beginning and had never
been written to. It is now stamped **by the Edge Function after the send
succeeds**, not by the client when it fires — the column has to mean "they were
told", not "we meant to tell them".

`flag_photo_outstanding` explains why the confirmation says, in capitals, to
bring photographic ID. It is the cheapest possible place to ask, and a delegate
who arrives without it has wasted the day.

There is no start time anywhere in the schema, only dates. Rather than add a
column nobody would maintain, "arrive in good time" lives in the wording, which
is editable. The same trick covers the address.

### The employer copy

`company.send_to_employer` already routes the ACS form; it now also decides
whether the employer is copied. One send with a `cc`, not two sends — one email,
one log row, and the delegate is visibly the person being written to rather than
receiving a copy of something addressed to their boss.

### A second context function, on purpose

`app_notify_booking` rather than another branch in `app_notify_context`. A
cancelled booking has already had its session removed by the time the email is
composed, so this family — and only this family — needs a second id passed in.
Adding a fourth parameter to a function four other families share would spread
that awkwardness over all of them. Verified both ways: without the session id it
returns `no_session`; with it, the email can still name the course they came
off.

### Verified

Against a throwaway delegate, employer and course, since deleted: confirmed,
moved and rescheduled all sent from `bookings@` with the right subjects;
`confirmation_sent_at` stamped only after the send; a non-existent booking
returns `no_booking` cleanly.

### Note for whoever redeploys the Edge Function

The deployed copy of `send-email` carries the same code as the repo with some
comment blocks trimmed. **Deploy from the repo files** so the two converge
again.

### Files

`supabase/migrations/20260829220000_delegate_booking_emails.sql` (applied),
`supabase/functions/send-email/*` (deployed, v7 — `cc` support and the booking
branch), `src/lib/api.js` (`attachPoolItem` now returns its booking id;
notifications on schedule, move, reschedule and return-to-pool).

## 2026-08-29 — Employers on the worklist, and a list that answers itself

### Seven years, not six

Simon's answer moved to seven. 20,980 rows → 5,028; people → 3,266; staff
spellings 40 → 24; **employers 1,492 → 115**. Qualification columns barely move
(122 → 106), so that list is the same size whatever the cut. The employer number
is the whole argument for cutting at all: 1,492 free-text company names was
never a job anybody was going to do by hand, and 115 is an afternoon.

Employers are now seeded onto the worklist, sorted by how often they appear.
The rubbish is visible and easy to dispose of — three phone numbers, "ADDRESS AS
ABOVE", "SELF", "MOD PAYMENT", "INVOICED TO EAGA - SPLIT PAYMENT ETC." — and the
duplicates are exactly what you would expect: CENTRICA / CENTRICA BUSINESS
SOLUTIONS / "CENTRICA SEND CERT TO WORK", EDINA / EDINA UK LTD, READ & ERRINGTON
/ READ AND ERRINGTON / R+E / R&E.

### Three UI rules, and they are the point

Chris: *"if we have an exact match or close have the dropdown on it already so
we can just click confirm, cuts down on time"* and *"a new field to add our own
name to a new course (just in case it's changed)"*.

1. **The suggestion is already in the box.** The dropdown arrives set to the
   match. The job is to press Confirm, not to find the right line in a list of
   110 codes.
2. **Nothing saves until Confirm.** A pre-filled control that saved itself would
   be a guess with extra steps — which is the one thing this screen exists to
   prevent.
3. **Create takes OUR name, not theirs.** A text field beside the dropdown,
   pre-filled from the suggestion (title-cased for names, upper for codes). The
   Access spelling is a starting point, not the answer.

And one that falls out for free: **two rows created under the same name become
one thing**. That is how EDINA and EDINA UK LTD merge — no separate merge UI,
just type the same name twice.

### A bug caught in the design, not in use

`app_import_accept_proposals` set `decision = 'map'` for everything. For
employers that would have mapped 10 suggestions onto companies that do not
exist — we hold ten companies and the file has a hundred, so an employer
suggestion means "call it this", which is a *create*. The function is now
kind-aware.

### Files

`supabase/migrations/20260829200000_import_mapping.sql` (bulk-accept made
kind-aware), `src/views/ImportMapping.jsx` (rewritten around confirm-not-save),
`src/lib/version.js`, `src/views/Roadmap.jsx`.

### Parked

Sage was researched in full and parked at Chris's request — which API, which
endpoints, how paid should work, and the three questions for Jen. It is written
up in project memory as `sgas-sage`, including the finding that a **development
account with test data** exists, so the build is not blocked on Simon's live
Sage after all.

## 2026-08-29 — Reading the Access database, and a worklist for the bits a computer should not guess

### What is actually in the file

`NEW SGAS Database 060617.mdb`, read with mdbtools. Nine tables, but only one
that matters: **`BlankTable2`, 20,980 rows and 159 columns**, plus four tiny
lookups. No relationships. Three `ExportErrors` tables and an
`MSysCompactError` sit beside it, which is what a previous failed import leaves
behind.

Each row is one person's assessment record: their details repeated, then ~122
yes/no columns, one per qualification code. About 8,300 distinct people.

### Three findings that changed the plan

1. **There is no teaching history to backfill.** The plan assumed the file held
   who taught and who assessed. Assessor is filled on 60% of rows and Verifier
   on 59% — but **Trainer on 7%**, and most of those say the literal words
   "Assesment only". An assessment history is importable; a teaching calendar is
   not.
2. **Each row may hold two sittings**, not one: `Assessor`/`Assessor2`,
   `StDate2`/`EnDate2`, `Exdate2`. Unresolved.
3. **Three expiry columns** — `Expirydate` (12,336), `Exdate2` (8,417),
   `expiryfive` (2,970). Whichever we choose drives the renewal engine, so
   choosing wrong is worse than not importing at all. Waiting on Simon.

### The worklist

`import_mapping`: one row per distinct value in the file that a person has to
resolve, with Claude's suggestion beside it and a `decision` that only a human
writes. **Nothing is imported on a guess.**

Seeded with 162 rows: 122 qualification columns (59 match our codes exactly, 25
near-certain — `OFT201`→`OFTEC201`, `MET1K`→`MET1`, `HTRPL2`→`HTRLP2` — and 32
with no home, of which `cen1` alone is ticked 1,783 times), and 40 spellings of
about eleven staff names. "S GASDSDON" (4,972), "S GADSDON" (1,765),
"S GASDSON" (213) and "S G" (4) are all one man.

### The screen

Progress gained tabs; the second is Data import. **One control per row** — a
dropdown holding our list, "create this", and "ignore" — because three buttons
and a text box per row is more flexible and nobody would reach the end of 122 of
them. Picking saves immediately. "Accept every suggestion" fills in only the
undecided rows, so it can never overwrite an answer.

It is admin-gated with its own password confirm, like the Admin page: the RPCs
take admin credentials and the Progress page had no gate of its own.

### Six years

Simon's answer, mid-session. It cuts 20,980 rows to 4,484 — and more usefully
1,492 employers to **96**, which turns employer matching from impossible into a
morning. Staff spellings drop 40 → 23. Qualification columns barely move,
122 → 106, so that list stays as it is.

### Files

`supabase/migrations/20260829200000_import_mapping.sql` (applied; the 162 data
rows deliberately not in it — they are read out of a file that is not in this
repo), `src/views/ImportMapping.jsx` (new), `src/views/Roadmap.jsx` (tabs),
`src/App.jsx`, `src/lib/api.js`.

## 2026-08-29 (end of day) — Forgotten passwords, account emails, and a ? that works everywhere

### The reset, and what it deliberately does not do

`password_reset` stores **only the sha256 of the token**. The token itself
exists in exactly two places: the email, and the URL the person clicks. A stolen
backup is not a way in.

Four things worth keeping:

1. **The browser never sees the token.** The client asks the Edge Function to
   start a reset; the function gets the token from a `service_role`-only RPC,
   puts it in an email, and forgets it. There is no client-callable path that
   returns one.
2. **The link is not built from the caller's input.** `app_setting.app_url`
   supplies the base. A reset email whose link comes from whoever asked for it
   is a phishing kit with extra steps.
3. **The answer is identical either way.** Existing account, no account, rate
   limited, no email on file — all return `{ok:true}` and nothing else. The
   difference between "sent" and "no such account" is a list of who works here.
4. **Using a link kills every other outstanding one** for that account, so a
   chain of "I clicked it twice" resets cannot leave a spare key in an inbox.

Rate limit: one live request per account per five minutes.

### A real bug the test found

`app_password_reset_start` matched `username OR email` and took the lowest
`user_id`. **Chris's admin username IS an email address**, so a reset requested
for a test account's address resolved to his admin login and posted a live link
to it. Fixed by ordering an exact username match first; the stray link was
cancelled. Two accounts can answer to the same string, and the more specific
claim has to win.

### Account emails are not on the open door

`password_changed`, `user_created`, `account_disabled`, `account_enabled` are in
`ADMIN_ONLY_KINDS` and require admin credentials. Everything else through
`notify` is a statement about a *course*; these are statements about somebody's
*account*, and anyone holding the public key could otherwise tell a member of
staff their password had been changed.

### index.ts grew a deliver()

Four ways in now — internal secret, admin, notify, and the two reset actions —
and they all needed the same send-and-log. `deliver()` is that, once, so a new
path cannot accidentally skip the log or invent its own error handling.

### Help

The `?` in the top bar already existed and read from `Help.jsx`; what it lacked
was content for the screens added since June and a mapping for four of them.
Every screen in the nav is now mapped (checked in a script, not by eye), with
two new sections — Emails, and Holidays — and a rewritten Admin section covering
the tabs, leaving, and the difference between disabling and deleting a login.
"Getting started" now answers "I have forgotten my password" and "I got an email
saying my password changed and it was not me".

### Verified

- reset request for a real account, a fake one, and a second request inside the
  rate-limit window: all answer `{ok:true}`; only one email was sent
- complete with a rubbish token, an expired one, a short password, and the same
  token twice: each refused with the reason a person needs
- a good token: password changed, old password dead, all links for that account
  closed, one `password_changed` email logged
- an account email with no admin credentials: `Not authorized`
- 15 groups of wording tests, three time zones
- every screen in the nav has help content (script-checked)

### Files

`supabase/migrations/20260829180000_password_reset_and_account_emails.sql`
(applied), `supabase/functions/send-email/*` (deployed, v6),
`src/views/ResetPassword.jsx` (new), `src/views/Login.jsx`, `src/App.jsx`
(`?reset=` before the sign-in gate), `src/views/Admin.jsx`,
`src/views/Help.jsx`, `src/lib/api.js`, `tests/wording.mjs`.

## 2026-08-29 (later still) — Holiday requests, and one context function for every email

Time off used to be a row somebody typed in. It is now a request with a
decision on it, and three emails from `holidays@`.

### Approver, with a fallback

Chris picked "a named approver with admins as fallback", and the reason is on
the record: Simon is in Australia from 11 September, and a single named approver
would stall every request for a fortnight. So `app_setting`
(`holiday_approver_staff_id`) names the person, and `canApproveHolidays()`
returns true for them *or* any admin. Their own time off skips the queue —
`app_notify_context` returns `approver_is_the_requester` rather than emailing
somebody to approve themselves.

`app_setting` is a plain key/value table, readable by anyone (the calendar has
to know who approves before it can decide whether to ask) and writable only
through an admin-gated RPC.

### One context function, not three

The notify contract changed from `p_session_id` to **`p_ref`** — "the thing this
email is about". A session for the course emails, a holiday for the holiday
ones. One function, one door in the Edge Function, and the next kind of email
is a branch rather than a new mechanism.

The Edge Function still accepts `session_id` as well as `ref`, deliberately: the
function deploys instantly and the browser does not, so a tab running the
previous build would otherwise stop notifying until someone reloaded it.

### Placeholders became per-template

`email_template.tokens`. One global list was fine with one kind of email and is
wrong with two — `{{course}}` means nothing in a holiday email, and offering it
in the editor only invites somebody to write it. The Admin editor now lists what
*that* template can use.

Holiday is counted in **working days** (`extract(isodow) < 6` in the context,
`fmtWorkingDays` in the wording), because that is how the rest of the app counts
it. A course is still counted in calendar days. Same `{{days}}` placeholder,
different sums, and the help text says so.

### A rejection carries its reason

`decision_note` goes into the email as `{{reason}}`. A "no" with no reason is
the one that gets argued about a week later.

### Verified

- all three sent live from `holidays@` against a throwaway approver and
  requester, both deleted afterwards, with the right recipient each way round:
  request → approver, decision → the person who asked
- `approver_is_the_requester`, `no_holiday`, `no_email` all return cleanly
- `session_id` still routes correctly after the switch to `ref`
- 13 groups of wording tests, three time zones

### Files

`supabase/migrations/20260829160000_holiday_requests_and_settings.sql`
(applied), `supabase/functions/send-email/*` (deployed, v5), `src/lib/api.js`
(holiday requests, settings, `canApproveHolidays`), `src/views/Calendar.jsx`
(request instead of enter), `src/views/Dashboard.jsx` (the approver's card),
`src/views/Admin.jsx` (who approves), `src/views/EmailSettings.jsx`
(per-template placeholders), `tests/wording.mjs`.

## 2026-08-29 (later) — Admin in tabs, and what "delete a person" actually means

### The unlock bug, which cost a morning

`unlock()` did this:

```js
try { await load(auth); setAdminAuth(auth); setUnlocked(true) }
catch (ex) { setUnlockErr(...) }
```

and `load()` ends `catch (e) { toast(e.message) }`. It never rethrows. So the
catch in `unlock` was unreachable and **a wrong password unlocked the page** —
onto an Admin screen where every call then failed. Chris saw an empty staff list
and an Email card that said nothing but "Password incorrect", and reasonably
concluded the new email work had broken it. The logs said otherwise:
`app_list_users` and `app_smtp_get` both returned 400 "Not authorized" in the
same second, and `app_list_users` has not been touched in weeks.

Two lessons, both in the code now:

1. **A helper that swallows its own errors cannot be used as a check.** The
   unlock calls `listUsers` directly and stands or falls on that.
2. **"Password incorrect" was one message covering three different failures** —
   wrong password, an account that is not an admin, and the server being
   unreachable. It now says which.

### Removing a person

Chris asked for delete on staff and logins. They are not the same problem.

**A login** has nothing pointing at it, so `app_delete_user` really deletes it.
Guards: never the account you are signed in as, never the last active admin.
(The second is defensive rather than reachable — the caller must itself be an
active admin, so there are always at least two.)

**A staff record** cannot go. `session` and `booking` both reference `assessor`
with `NO ACTION`, and that is correct: the audit runs on who taught what. So
`assessor.left_on` marks the day they left. They disappear from `listStaff()` —
which is the single function every trainer/assessor/verifier picker in the app
reads, so one change removes them from all of them — and nothing they have
taught moves. "Show past staff" passes `{ includeLeft: true }`, and Reinstate
clears the date.

Chris's own framing, kept verbatim in the design: *"all legacy items they taught
and their file stay in place... if in the future, say they leave and there's a
course next week, it flags in the calendar that this now needs a trainer, it
doesn't lock on those ones."* So `block()` computes `trainerGone` — a trainer
who has left AND a course that has not finished — which feeds `ready`, the
dashboard's `missing` line, and the calendar's Needs attention. A course that
has already run keeps its trainer and stays `ready`. Verified all three cases
against a real row.

A record with **no** history is offered as a real delete, which is exactly the
four seed staff. The database is the thing enforcing that distinction, not a
checkbox in the UI.

### Tabs

Staff / Logins & access / Email. The staff table went from eight columns to six
by moving username, role and status to the accounts tab, which also gave the
non-staff accounts a home instead of a conditional block at the bottom of the
page. No new CSS — `.seg-tabs` and `.btn sm` / `.btn sm ghost`, the same pattern
the Schedule screen uses.

### Verified

- self-delete refused; a normal login deleted; a staff row with history refused
  by the foreign key (Simon intact, 9 staff and 35 sessions before and after)
- `left_on` filtering: 9 shown by default, 10 with past staff
- `trainerGone` against a real future session with a departed trainer: flagged;
  the same course dated in the past: untouched and still ready

### Files

`supabase/migrations/20260829140000_staff_left_and_delete_user.sql` (applied),
`src/lib/api.js` (`listStaff({includeLeft})`, `setStaffLeft`, `staffUsage`,
`deleteStaff`, `deleteUser`, `trainerGone` in `block()`),
`src/views/Admin.jsx` (rebuilt), `src/views/CalendarNext.jsx` (Needs attention).

## 2026-08-29 — Three notifications, and the wording moved out of the code

The plumbing built on the 28th could send but nothing used it. It does now.
`trainer_assigned`, `trainer_removed` and `course_moved` go out on their own,
and the words they use live in the database where Chris can change them.

### The problem worth writing down: nothing to authenticate with

Every email path so far takes admin credentials, because the Admin screen has
them to hand. A trainer notification does not. It fires when somebody drops a
name onto a course, that somebody may be a scheduler, and the browser does not
keep anyone's password — `app_login` checks it in the database and hands back a
sanitised row.

Three options were on the table:

1. **Hold the password in memory after login.** Rejected: a password kept
   around for the convenience of a feature is a password waiting to leak, and
   it dies on refresh anyway.
2. **A trigger or cron job inside the database.** The right long-term shape,
   and where the scheduled accreditation alerts will live — but it needs
   `pg_net` and `pg_cron` (neither installed) plus `SGAS_INTERNAL_SECRET`
   (not set, and only Chris can set it in the dashboard). All of that to ship
   one email.
3. **Narrow the door instead of widening the caller.** Taken.

The notify path accepts no address and no body. It accepts *"session 42 just
had a trainer put on it"*, and `app_notify_context` — `SECURITY DEFINER`,
`service_role` only — decides who is told, in what words, and whether the
notification is switched on at all. The worst an anon caller can do with it is
make a real trainer receive a true statement about a real course, at most once
per ten minutes. Measured against `p_anon_all`, which still lets the same key
read and write every delegate record in the system, that is not the risk worth
worrying about.

### Editable wording

New `email_template` table (RLS on, no policies, grants revoked from
`anon`/`authenticated`), seeded with the three. `app_email_templates` /
`app_email_template_save` are admin-gated exactly like `app_smtp_get`.
Placeholders are `{{like_this}}` and unknown ones are **left standing rather
than blanked**, so a typo shows up in the preview instead of silently emptying
a line.

The preview is rendered by the Edge Function itself, one step short of the mail
server, so it cannot drift from the email. It renders what is *stored*, not the
unsaved draft — save, then preview.

### Repeats

`app_email_recent` suppresses an identical kind + session + recipient +
**subject** inside ten minutes. Keying on the subject rather than a plain time
window is deliberate: the subject carries the dates, so a genuine second move —
to different dates — is a different subject and still goes out. A burst of
identical updates from dragging a bar about does not.

### Dates

`wording.ts` is split out of `index.ts` purely so it can be unit-tested with
`node --experimental-strip-types` (index.ts calls `Deno.serve` at import and
cannot be loaded outside Deno). Dates are parsed as UTC on purpose:
`new Date('2026-09-14')` is midnight UTC and printing it with `getDate()` in a
behind-UTC zone gives the 13th — the same trap `todayISO()` is still sitting in
elsewhere in the app. `tests/wording.mjs` runs in Los Angeles and Auckland to
prove it.

### Verified

- 10 groups of wording unit tests, in three time zones
- `app_notify_context` returns a clean reason for every skip: template off, no
  trainer, no email on the record, no such session, unknown kind
- over HTTP with the real anon key: the notification sends, an arbitrary send
  is still `Not authorized`, a preview is still `Not authorized`, and neither
  new RPC nor the template table is reachable
- three real emails sent and logged, against a throwaway trainer and course
  that were then deleted. No real staff were emailed.

### Files

`supabase/migrations/20260829090000_email_templates_and_notify.sql` (applied),
`supabase/functions/send-email/index.ts` + `wording.ts` (deployed, v3),
`src/lib/api.js` (`notifyEmail`, template calls, and the two write paths that
fire them), `src/views/EmailSettings.jsx` (tabs + the wording editor),
`tests/wording.mjs`.

## 2026-08-28 — The test send failed. Two faults, and what each one taught.

Chris entered all three passwords, pressed **Send test email**, and got:

> Edge Function returned a non-2xx status code

Nothing in `email_log`. That absence was the useful clue: the function logs
*every* attempt, delivered or not, so an empty log meant the failure happened
before the send — in the setup, not at the mail server.

### Fault 1 — the password could never have been read

The function fetched it with:

```js
db.schema('vault').from('decrypted_secrets')
```

PostgREST only serves the schemas it is configured to expose — `public` and
`graphql_public`. A request for the `vault` schema is refused before it reaches
the database. The password decrypts perfectly well in SQL (verified: all three
mailboxes, `decrypts = true`); the *route* to it was wrong.

This is a defect a passing build cannot catch, a passing type-check cannot
catch, and the anon-role security probes ran last session did not catch either —
they proved a browser *could not* reach the vault, and read that as success. The
same probe never asked whether the server could.

**Fix:** stop reaching across schemas from outside. `app_smtp_dispatch(p_key)`
is a `SECURITY DEFINER` function in `public` that returns host, port, secure,
address, username, from_name and the decrypted password in one call;
`app_email_log_write(...)` records the attempt. The Edge Function now touches
nothing but RPCs.

#### The grant that nearly shipped a password to the browser

`app_smtp_dispatch` returns a **plaintext password**, so it must be
service-role only. The migration said:

```sql
revoke all on function public.app_smtp_dispatch(text) from public;
grant execute on function public.app_smtp_dispatch(text) to service_role;
```

and that is **not enough**. Supabase's default privileges grant `EXECUTE` to
`anon` and `authenticated` *directly*, so those grants survive a revoke aimed at
`PUBLIC`. Checked rather than assumed:

```sql
select has_function_privilege('anon', p.oid, 'execute') ...
-- app_smtp_dispatch | anon: true
```

`anon` could have called it and been handed the SMTP password. Fixed with an
explicit `revoke ... from anon, authenticated`, re-checked (`anon: false`), and
confirmed over HTTP with the real anon key: `42501 permission denied for
function app_smtp_dispatch`.

The lesson worth keeping: **a `revoke ... from public` on a Supabase function
does not remove the client roles' access.** Always name them, and always verify
with `has_function_privilege` rather than trusting the statement ran.

### Fault 2 — the real reason was being thrown away

`supabase-js` turns every non-2xx from an Edge Function into the same sentence
and puts the actual response body on `error.context`. The function had described
its own failure precisely; `api.js` reported `error.message` and binned it.

**Fix:** `functionError()` reads the body off `error.context` before falling
back, and a single `sendMail()` wrapper now fronts every send so the flows added
next inherit this rather than each reinventing it.

Also hardened inside the function: an RPC that *errors* and an admin check that
*says no* are now different messages. “Not authorized” should mean the password
was wrong, not that the database was unreachable.

### What is proved, and what is not

A temporary probe function (since retired) opened a TLS socket from Supabase to
the mail server:

```
220 smtp2.lhr.stackcp.net ESMTP  — 465/TLS, 710ms
```

So the host is right, the port is right, and outbound SMTP is not blocked.
Verified as well: all three secrets decrypt, `app_smtp_dispatch('crm')` returns
a complete config, the function answers `401 {"ok":false,"error":"Not
authorized"}` cleanly without credentials, and neither new RPC is reachable with
the anon key.

**Not** proved: that the three passwords are correct. Only a real send can show
that, and it needs Chris's admin password — which is exactly the property the
design was built for. A failure now names itself.

## 2026-08-28 — Email plumbing, and an Admin screen to set it up

Chris has the SGAS mailbox details and asked for somewhere in Admin to enter
them, with the password box left blank once stored. That last instinct is right
and has a name — a write-only secret — and it is what the whole design is built
around.

### Where the passwords live
NOT in a column. They go into **Supabase Vault**, which encrypts them with a key
held outside the database. `smtp_mailbox` keeps only the secret's id. The only
component that ever decrypts one is the `send-email` Edge Function, using the
service-role key, and it scrubs the value out of any error it returns — SMTP
libraries have a habit of quoting failed credentials back at you.

Hashing was floated and would have been wrong: a hash is one-way, and an SMTP
password has to be *replayed* to the mail server on every send. Hash it and
nothing ever sends again.

### Why not an env var
The obvious answer, and better in isolation, but Chris wants to manage this from
Admin rather than a dashboard. Vault plus the RPC gate gets most of the way
there and keeps it editable.

### Locked down
`smtp_setting`, `smtp_mailbox` and `email_log` have RLS on with **no policies**,
and the table grants are **revoked** from `anon`/`authenticated` outright — two
independent locks, so a future "add a permissive policy" mistake still cannot
expose them. This matters more here than usual: every other table in this
database carries `p_anon_all` (ALL, `qual: true`), so the public anon key in the
JS bundle is effectively a full read/write key to everything else. Verified as
the anon role: SELECT, UPDATE and INSERT on all three tables are refused,
`vault.decrypted_secrets` is refused, and `app_smtp_get` with a wrong password
is rejected.

### The screen
`src/views/EmailSettings.jsx`, in Admin. Server and the three mailboxes come
pre-filled with SGAS's own settings, so the only thing anyone ever types is a
password. The password boxes start empty, **return to empty after a save**, and
nothing the server sends back can fill them — `app_smtp_get` returns
`password_set: true/false` and never the value. Empty therefore means "keep the
stored one"; `__CLEAR__` removes one. There is a test-send button that reports
what the mail server actually said, and a log of every attempt, because "did
Simon get the expiry warning?" has to be answerable.

Uses only existing classes (`.card`, `.body`, `.field`, `.fl`, `.inrow`,
`.twocol`, `.btn`, `.b`, `.tag`) — no new CSS.

### Verified
26 assertions at desktop and phone: the card renders, the server is pre-filled,
every box starts empty, a typed password saves, **the box is blank again
afterwards**, only that mailbox flips to "Stored", the count moves, and the
typed value appears nowhere in the page HTML, any input, localStorage or
sessionStorage. No console errors.

### Not done yet
The four actual emails — trainer-assigned, expiry alerts, renewal chase, booking
confirmation. This is the plumbing they all sit on.

## 2026-08-28 — The runtime tests live in the repo now

They had been in `/tmp` on the cloud container, which is discarded when a session
ends — so the most reusable thing built all day would have died with it.

`tests/` now holds all four suites (213 assertions) plus a README covering how to
rebuild the harness, and the two rules that make them worth having: assert on the
DATA changing rather than the gesture completing, and look at the screenshots —
four defects this session passed every assertion and were caught by eye.

## 2026-08-28 — Calendar (new look): nothing paints outside a course's own dates

Review: *"on the year view some text of courses is appearing outside the allotted
time?"* Correct, and it was a deliberate decision of mine that was wrong. An
earlier critic pass complained that short year bars were anonymous, so I added
`.cx-yout` — the name rendered at `left: calc(100% + 6px)`, outside the bar. On a
date-scaled row that is a lie: it says the course runs on days it does not.

### Fixed
- **`.cx-yout` is gone.** A year label lives inside its bar, clipped with an
  ellipsis. A bar under three days shows no text at all — the colour, the
  `title` tooltip and the rail carry it, and the bar's length stays honest.
- **The name is now the thing that shrinks.** A bare text node cannot take a
  `min-width`, so on a phone a long course name pushed the delegate-count `<em>`
  clean outside a Month bar. The name is wrapped in `.cx-bar-n`
  (`min-width:0; flex:0 1 auto; ellipsis`) and the badge, part-attendance mark
  and split-colour strip are `flex:0 0 auto`.
- **Handle clearance was applying to year bars.** `.cx-bar:has(.cx-grab)
  .cx-bar-t{padding-left:17px}` beat `.cx-ybar .cx-bar-t` on specificity, so a
  27px year bar carried 33px of padding for handles — that was the last 6px of
  overflow. Scoped to `:not(.cx-ybar)`.

### Added
- **`overflowcheck.mjs`** — a general guard, not a fix for one case: for every
  bar in every view at desktop, tablet and phone, no descendant may lay out more
  than 2px beyond the bar's own box. It found the two phone faults above, which
  had not been reported.

### Changed
- The old assertion "Year: every bar is named, however short" encoded the
  behaviour just rejected. Replaced with: no label reaches past its own bar,
  every bar names its course in a tooltip labelled or not, and bars wide enough
  still show a name.

## 2026-08-28 — Calendar (new look): the rail cards fold

Review: *"collapsable right hand items in the sidepanel i think as its too long
now."* Four cards ran off the bottom of the screen.

### Added
- **`RailCard`** — every card in the rail folds from its heading. State per card
  in `sgas_cx_cards`; Trainers starts folded, being the one you reach for least.
  Rail height 1014px → 273px with all four folded.
- **The count stays on a folded header.** Folding "Needs attention" away must
  never hide that there are courses without a trainer.
- **Spring-loaded.** Hovering the folded waiting list mid-drag opens it, and so
  does picking anybody up, so folding it away never costs you a drop target.
- Folding removes the contents rather than hiding them (`{open && …}`), so
  nothing inside a folded card is still tabbable.

### Fixed
- **Every rail card was the same height on a phone, folded or not.**
  `.cx-card{flex:1 1 260px}` was written for the ≤1000px row layout, but the
  ≤640px rule flips the rail back to `flex-direction:column`, where that
  flex-basis is a HEIGHT — so all four cards were 260px tall and shrunk to their
  own text width. `flex:0 0 auto;width:100%` in the column rule. Pre-existing;
  folding is what made it obvious.
- The ≤1000px row layout stretched every card to the tallest one in its line —
  `align-items` and `align-content: flex-start`, or folding a card saved nothing.

### Verified
26 assertions at desktop and phone sizes: every header is a real toggle with
`aria-expanded`, they all fold, the rail gets much shorter (1014→273 desktop,
994→273 phone), folded cards still show their counts and hold no rows, the state
survives a reload, and a folded waiting list springs open when you pick a
delegate up. The existing 101 + 68 still pass.

## 2026-08-28 — Calendar (new look): drag people onto the calendar

Review: *"the sidebar with waiting to be placed etc should be able to be dragged
onto the calendar (thoughts?) multiple ways to do things i always feel is best"*,
then *"needs to be doable on all things including touch. phone tablet the lot"*.

### Added
- **One drag layer, four drops.** `targetAt()` hit-tests with `elementFromPoint`,
  `dropVerdict()` decides what a drop would do, `performDrop()` does it. The
  highlight under the pointer and the action on release read the same function,
  so they can never disagree.
  - a waiting delegate onto a **course** → booked on it
  - a waiting delegate onto **empty days** → the booking panel opens on that day
    with their scheme's courses in a first `<optgroup>`, and they are added the
    moment it is booked
  - a **trainer** onto a course → assigned
  - a delegate **off** a course onto the waiting list → returned to the pool
- **A Trainers card in the rail**, showing how many courses each already has on.
- **A ghost that follows the pointer** naming the person and what the drop will
  do, coloured green / amber / red, with the target outlined to match. It warns
  before a scheme mismatch or a trainer who is on holiday that week.
- **Tap to pick up, tap to put down.** Dragging a person the length of a phone
  screen is a bad gesture however well it is built, so a tap arms "placing":
  every valid target lights up, a pinned bar says what you are holding, and a
  tap puts them there. Escape or Cancel puts them down. This is the phone route
  and it works on a desktop too.
- **Edge auto-scroll while dragging**, so the rail and the calendar do not have
  to be on screen together — on a phone the rail is a long way below the grid.

### Accessibility
Everything here is an accelerator. The course panel keeps "Add someone from the
waiting list", a trainer picker, and "take off" with a confirm, so there is a
non-drag route to all four — WCAG 2.2 SC 2.5.7. Pointer events throughout, with
`touch-action:none` on the handles; no HTML5 drag-and-drop, which is dead on
touch and still is on the Schedule board.

### Fixed along the way
- The popover sat above the rail and swallowed the drop when you dragged a
  delegate out of a course. `body.cx-dragging` now takes the panel, its caret
  and its scrim out of hit-testing.
- Auto-scroll fought the drop: a course within 90px of the top slid out from
  under the pointer as you reached it. It now holds still while you are over a
  valid target, except in the outer 40px, where it always scrolls so you are
  never stuck on something you were only passing over.
- Picking somebody up from inside the course panel closes it — on a phone it is
  a full-width sheet over the very list you then have to tap.
- The placing bar was `position:sticky` and scrolled away on a phone, which is
  exactly when it is needed. It is pinned.

### Verified
76 assertions across **desktop (1600×1000), tablet (820×1180) and phone
(390×844)**, plus 101 in the existing suite. Every drop is checked by the data
changing, not by the gesture completing: the waiting-list count, the delegate
appearing on the booked course, the trainer's course count. The phone run
exercises the real gesture — hold at the top edge and let the page scroll (1176
→ 600 during one drag). A click still does nothing but pick somebody up.

## 2026-08-28 — Calendar (new look): the popover came unstuck on scroll

Reported with a screenshot: with a course open, scrolling left the panel nailed
to the screen while the calendar moved away underneath it, and the page repainted
into a mess — content shoved sideways, the caret stranded mid-page.

### Fixed
- **The anchor was a frozen `DOMRect`.** `openAt` captured
  `getBoundingClientRect()` at click time and `place()` recomputed from that same
  stale rect forever, so scrolling could never move the panel. `at` is now
  `{ sel, fx }` — a CSS selector for the anchor plus how far along it you clicked
  — and the rect is measured fresh on every placement. Reproduced first: page
  scrolled 320px, panel stayed at y=160.
  - A selector also survives React replacing the node on a re-render, which a
    captured element reference would not.
  - `fx` is a fraction of the bar's width rather than a viewport x, so it stays
    correct through scrolls and resizes.
- **Scroll handling was unthrottled and re-rendered on every frame.** It is now
  one measurement per animation frame, and `commit()` skips the state update
  when nothing moved — that churn is the likeliest cause of the broken paint.
- **The sheet branch looped forever.** `commit()` compared `Math.round(undefined)`
  against itself; `NaN !== NaN`, so every pass committed a new object and
  re-rendered. It cost the phone sheet entirely. Comparison is now null-safe.
- **The caret read `panelRef.current.offsetHeight` during render**, a value from
  the previous layout. The measured `w`/`h` are carried in `pos` instead.

### Changed
- When the anchored course leaves — scrolled fully out of view, or removed
  because you paged to another month — the popover closes. A panel pointing at
  nothing is worse than no panel.
- Rail rows carry `data-bid` and anchor to themselves, not to the calendar bar
  for that course, which may not be in the month you are looking at.

### Verified
101 Playwright assertions. New: with a course open and the page scrolled 260px
the panel moves with it, the caret stays within 24px of the bar it points at
(0px before, 10px after), nothing overflows sideways, it stays on screen; and
paging to another month closes it along with its caret.

## 2026-08-28 — Calendar (new look): book a course from any view

Review: *"need to create in year view too."*

### Added
- **Drag across days to book a course in every grid.** `cellDown` was bound to
  `.cx-cell` in the month grid; it now looks for `[data-d]`, and the year rows
  (`.cx-ycell`) and the week/day all-day band (`.cx-band-cell`) carry `data-d`
  plus the same `onPointerDown`. One handler, four views.
  - In Year view a drag can cross a month boundary — the rows are months, the
    dates compare as ISO strings, so 30 Mar to 02 Apr books a four-day course
    spanning both rows.
- **A chip follows the pointer while you select**, saying how many days and
  which dates. The bar-drag chip rides the bar; a selection has no bar to ride,
  so this one tracks the cursor (`.cx-chip-len.float`).
- **The booking panel is the same `Popover`**, anchored to the last day you
  dragged over — the create flow no longer opens a centred modal while the
  course flow opens beside the bar. Its dates are editable before booking, so a
  drag that landed a day out is fixed in place rather than redone.

### Changed
- A drag now books, and a **click never does**, judged on whether the pointer
  moved rather than on whether the dates differ — the old test meant a one-day
  course could not be booked by dragging at all.
- Empty year rows have a 40px minimum height, so a month with nothing in it is
  still a comfortable drag target.
- `Modal` is no longer imported by `CalendarNext` — both panels are popovers.

### Verified
90 Playwright assertions. The new ones: in Year, Month and Week a drag across
three free days highlights them, shows the length, and opens a booking panel
pre-filled with those dates and a course picker; booking one in Year actually
adds a bar and opens the new course; a drag from March into April spans both
months; and a plain click books nothing.

## 2026-08-28 — Calendar (new look): a collapsible rail, and colour by scheme

Review: *"can we have the right bar collapsable/comes in when needed, and on the
modal \u2026 can we have the courses the attendees are doing on the selector part
colour coded with a line or something?"*

### Added
- **The rail collapses.** A toggle in the toolbar; `.cx-body.no-rail` drops to a
  single column and the calendar takes the space back (900 → 1218px at 1500
  wide). Persisted in `sgas_cx_rail`, defaulting to open at ≥1280px and closed
  below. While it is closed the button carries the "needs attention" count, so
  folding it away never hides an unstaffed course — that is the "comes in when
  needed" half.
- **`schemeColour(name)`** — the sixteen schemes we run are pinned to a colour;
  anything new hashes into the same palette so it is at least stable between
  visits.
- **The attendee selector is colour-coded.** Each person waiting carries a
  4px line in the colour of the scheme they are waiting for, plus the scheme
  name and how many qualifications. Anyone waiting for the same scheme as the
  open course is tinted, outlined and **sorted to the front**, with a line under
  the list saying how many. Delegate rows already on the course carry the same
  line, so the two lists read as one system.
- Somebody already on the course is dimmed and labelled — a person can hold a
  second booking so it is a warning, not a filter, but nothing here undoes an
  accidental double-add.
- The rail's "Waiting to be placed" rows use the scheme colour instead of a
  hardcoded green.

### Fixed
- `.cx-rail` sets `display:flex`, which beats the `[hidden]` attribute — the
  rail was dropping below the calendar instead of disappearing. Caught by
  screenshot, not by the assertion, which had only checked the attribute; the
  test now checks computed display and height.

### Verified
66 Playwright assertions. The new ones: the rail toggles, the calendar reclaims
the width, closed really means gone, the state survives a reload, the button
badges the attention count while closed; the selector renders a chip per person,
each names its scheme, the lines are distinct per scheme, and the ones that fit
the open course come first.

## 2026-08-28 — Calendar (new look): the Calendars-style popover

Review: Chris sent Calendars by Readdle — *"the popout/modal window looks super
clean and nice"* — and asked for the anchored popover, editing in place, the
side-by-side date blocks, the quiet icon rows, the duration chip on the bar,
round grab handles, the now-line time chip, and for the whole thing to feel
fluid.

### Added
- **`src/components/Popover.jsx`** — a popover anchored to what you clicked.
  Keeps everything `Modal` earned (Escape, focus trap, focus restored,
  confirm-before-discard while dirty) and adds placement that prefers
  below → above → beside, clamping inside the viewport, re-placing on scroll
  and resize, a caret that points back at the anchor wherever clamping pushed
  it, and a bottom sheet under 720px.
  - It anchors to **where you clicked on the bar**, not the bar's rect: a course
    can be most of a week wide, and anchoring to the whole thing pushed the
    panel across the grid and hid the course you were editing.
  - The caret renders **outside** the panel — the panel scrolls, and anything
    hanging off a scrolling box is clipped.
  - It focuses the panel, not its first control: a popover is something you
    read, and stealing focus into a `<select>` puts a loud ring on open.
- **Editing in place.** No edit mode and no Save button: the course, the dates,
  the trainer and the roster all commit on change, and the footer says so.
- **One date object** — starts, ends and the day count in a single bordered
  block, not two boxes and a detached pill.
- **Labelled rows** — Trainer / On this course / Scheme. An icon on its own is
  a guess.
- **The duration chip rides the bar** you are dragging instead of trailing the
  cursor, and the bar stops clipping it (`body.cx-dragging .cx-bar`).
- **Round handles** at each end on hover, and the bar title now starts clear of
  them.
- **The now-line carries the time**, at the left of today's column.

### Changed
- `listBlocks` returns `courseId`, so the popover can change which course a
  block is.
- "Needs a trainer or delegates" is a triangle, not an amber dot — it was
  indistinguishable from a course whose own colour is amber (OFTEC).
- "split" → "only some days"; "remove" → "take off", with a confirm and a
  28px-high target. It saves instantly and there is no undo.
- The waiting list is behind a disclosure; eight name chips permanently on show
  made the panel twice as tall as it needed to be.

### Verified
57 Playwright assertions against a production build: the popover anchors beside
the bar and never covers it, carries a caret, is fully on screen, flips at the
edge, closes on Escape and on an outside click, saves a trainer change without
closing, becomes a sheet with a scrim at 390px; the drag chip appears on the
bar, says the length, and goes on release without opening the course. No
console errors.

## 2026-08-28 — Calendar (new look): Week, Day and Year

Review: *"the resizer still doesn't work properly, it opens the event after
resizing; if it goes over a week you can't shrink it back to say 4 days over
multiple lines"* — plus *"let's move to the other views."* Both bugs are fixed
and verified end to end; Week, Day and Year are built and were then put through
an independent critic against Google Calendar, twice.

### Fixed
- **A drag ended by opening the course you had just dragged.** A pointer drag
  still fires a `click` on release. A `justDragged` ref, cleared after 250ms,
  now swallows that one click in all three grids.
- **A course that crossed a week boundary could not be shrunk back.** The drag
  was nudging inline `width`/`transform` on the element, which cannot reflow a
  bar onto a different row. The drag now writes to a `preview` state that the
  whole grid lays out from, so a two-row course collapses back to one row —
  verified by dragging one from 9 days to 4 across the boundary.

### Added
- **Week, Day and Year views**, with a Day/Week/Month/Year switcher whose
  choice persists. `barDown` reads its column width from the nearest
  `[data-cols]` track, so one drag handler serves all three grids.
- **One date drives every view.** `month` was separate state, so paging to July
  in Month and clicking Week threw you back to today. `month` is now derived
  from `anchor`.
- **Jump to a month** from the title — month grid plus year steppers.
- **A day scale on the Year view.** Every month row is drawn on the same
  31-day scale (short months hatched), so dates line up down a column. Bars are
  no longer padded out to fit their label; a course too short to hold its name
  is labelled alongside, clipped to the gap before the next bar.
- **The Day view is a roster** — course, trainer, and every delegate with what
  they are there for — not a second copy of the all-day strip above it.
- **The hour grid collapses when nothing is timed.** Every course here is an
  all-day, multi-day thing, so 07:00–20:00 was most of the screen saying
  nothing. One line offers it; it can be hidden again.
- **`data-bid` on every bar**, so runtime tests can follow one course across a
  reflow.

### Changed
- “Needs attention” is no longer scoped to the visible month — it hid unstaffed
  courses the moment you paged away from them.
- The right-hand rail lists the year, not "no courses this month", in Year view.
- The key above the calendar names its two groups: dots are why each person is
  there, the bar itself is the course colour.
- 07:00 no longer collides with the all-day divider.

### Verified
30 assertions in a headless Chromium run against a production build — all four
grids render, no dialog opens after any resize, a course stretches across a week
boundary and shrinks back to 4 days, view switching holds the date, the month
jump works, the Year scale is uniform and every bar is named. No console errors.

## 2026-08-28 — Calendar (new look): stretching a course

Review: "stretch to new days is hella janky." It was. Three separate faults.

### Fixed
- **The resize never followed the pointer.** `barDown` set
  `el.style.width = Math.max(w * 0.6, el.offsetWidth)` — reading the element's
  own width back each frame, so it wrote the same value repeatedly and only
  jumped on release. The starting width is now measured **once** and the bar is
  sized to `startW + delta * colWidth`.
- **The bar rubber-banded a frame behind the cursor.** `.cx-bar` carries a
  140ms transition on `transform`; a `.dragging` class now removes it, and
  `body.cx-dragging` kills text selection so the grid stops highlighting blue
  mid-drag.
- **After release the bar collapsed to the width of its own text.** The inline
  styles were cleared in a `finally` that ran *after* `await load()` — by which
  point React had already written the correct `width`, so clearing it wiped
  React's value and the bar fell back to `width:auto`. Inline styles are now
  dropped synchronously before any await, and the block is **updated
  optimistically in state** so it stays where it was dropped instead of
  snapping back while the save is in flight. A failed save reloads to revert.

### Changed
- Drags **snap to whole days** as you go, rather than following pixels and
  snapping at the end.
- A **live label follows the pointer** with the dates the drag will produce
  ("06 Jul 2026 – 12 Jul 2026 · 7 days"), so it is not guesswork.
- A course can no longer be dragged shorter than one day.
- The move handle is only on a course's **first** segment and the resize handle
  only on its **last**. Both used to appear on every week a course crossed, so a
  middle segment offered a resize that made no sense.
- Grab areas widened to 18px.

Measured in headless Chromium frame by frame: at +1/+2/+3/+4 days the bar was
762 / 890 / 1018 / 1147px against 762 / 890 / 1018 / 1147 expected, and after
release a 5-day course correctly became 9 days across two week rows.

## 2026-08-28 — Calendar (new look), round two

Review feedback: white modal in dark mode, no resize, no create, missing the
split colour coding, and no way to split a delegate's attendance.

### Fixed
- **The course window was white in dark mode.** `.cal-modal` hardcodes
  `background:#fff`, and `.cx-modal` never overrode it — so the panel was a
  white box with `--cx-ink` (pale) text on it. `.cx-modal` now carries its own
  surface, and `.cx select` / `.cx input` are themed too.

### Added
- **Resize.** A `.cx-resize` handle mirrors the move handle: the left edge
  moves the course, the right edge changes its length, clamped so the end can
  never pass the start. Both are pointer-driven, so both work on touch.
- **Create.** Dragging across days now opens a small New course sheet
  (dates + which course + Create it), which drops you straight into the new
  course's window to add a trainer and delegates. "Use the full set-up instead"
  hands off to the wizard. Previously the drag only raised a toast.
- **Split colour coding, carried over from the calendar people know.** Each bar
  gets a stripe along its bottom edge with one segment per delegate, coloured
  by why they are there — New, Reassessment, Not yet competent, No-show. A
  mixed course now reads without opening it. A legend above the grid decodes it.
- **Splitting a delegate's attendance.** `isPart()` marks anyone with
  `attendFrom`/`attendTo` set: their stripe segment is half-opacity, the bar
  carries a ◧ marker, and their row in the course window shows the dates they
  actually attend. Admins get a "split" control writing through the existing
  `setBookingAttendance`, with "all of it" to clear it.

Verified in headless Chromium: dark modal renders on the dark surface,
3 delegate stripes and 4 resize handles present, drag-to-create opens the sheet
and creates a real course, and a resize grew a bar from 249px to 377px. No
console errors.

## 2026-08-28 — Calendar (new look), on its own tab

### Added
- **`src/views/CalendarNext.jsx`** — a visual revamp of the month calendar,
  added as a separate "Calendar — new look" tab. **The live Calendar, Schedule
  and Set up a course screens are untouched.** All styles are namespaced `.cx-`
  so they cannot leak into the existing calendar.
  - Real type hierarchy: a 26px month title instead of a row of small grey
    buttons, and a single primary action.
  - Bars are tinted with the course colour and carry it as a left edge, with
    the delegate count as a pill and an amber dot when the course is missing a
    trainer or delegates.
  - An agenda rail: what needs attention, what is on in the month being viewed,
    and who is waiting to be placed — scoped to the visible month, so it never
    contradicts the grid.
  - Comfortable / Compact density, and a **dark mode** (`.cx-dark`), both
    remembered per browser.
  - Motion that carries meaning: the grid slides in the direction of travel,
    a moved course pulses once on landing, skeleton cells while loading.
  - Rows size themselves to the number of stacked courses rather than always
    rendering six weeks.
  - The course window puts the trainer, the roster and the waiting list in one
    place, with the waiting list as tappable chips — the drawer's job, done in
    a window.
  - Reuses the shared `Modal`, so Escape, the focus trap and `role="dialog"`
    come with it.

Rendered and checked in headless Chromium at 1500px and 390px, light and dark,
with no console errors.

## 2026-08-28 — Calendar correctness pass

Driven by an adversarial audit against Google Calendar. Verified in a real
headless browser (Playwright + Chromium) at 375px and 1440px, not just by
`vite build` — the `setNonce` crash proved a passing build means very little.

### Fixed — losing work
- **New shared `src/components/Modal.jsx`.** Every modal now: closes on
  Escape, traps Tab, is `role="dialog"` with an accessible name, focuses its
  first control on open, restores focus on close, locks background scroll, and
  **asks before discarding** when there is unsaved input. Previously none of
  the four modals did any of this, and the backdrop silently binned typed input.
- **`CreateModal` was a trap** — its overlay had a `stopPropagation` guarding a
  handler that did not exist, so neither backdrop nor Escape closed it.
- **The wizard no longer loses five steps to a stray sidebar click.** The draft
  is kept in `localStorage` (`sgas_setup_draft`), restored on return with a
  "Picked up where you left off / Start again" notice, and cleared once the
  course is created.
- **A single tap no longer opens the New Block form.** `MonthView.cellDown`
  fired `onCreate` even when start === end, so looking at a day meant
  dismissing a dialog. Only a genuine multi-day drag creates now.
- **Date fields commit on blur, not on change.** A native date input fires
  `change` per edited component, so typing a date issued an `updateBlock` per
  keystroke, mostly for nonsense intermediate dates.

### Fixed — touch
- **Every remaining mouse-only drag is now pointer-driven.** Year-view bar
  move/resize and the entire Week/Day view used `mousedown`/`mousemove`, which
  never fire for a touch drag — rescheduling a course by dragging was
  impossible on a tablet. `e.button` guards now tolerate a missing button.
- `pointercancel` is handled and listeners are removed on every path. Without
  it a cancelled touch drag left listeners attached, and the *next* tap
  anywhere opened a New Block modal for a range nobody chose.
- **Drag handles were 7–8px and invisible until `:hover`** — which does not
  exist on touch. The visual stays slim; the grab area is padded out via
  `::after`, handles are always visible under `@media (hover:none)`, and touch
  targets there go to 40px.
- The month and year grids had `touch-action:none` on every cell, so on a phone
  the grid swallowed scrolling and every attempt started a drag. Now `pan-y`
  below 640px.

### Fixed — keyboard
- **The whole sidebar was unreachable by keyboard** — `<a>` with no `href` is
  not in the tab order. Now `<button>` with `aria-current`.
- Visible `:focus-visible` rings across buttons, chips, nav, bars and links.
  Only inputs had focus styling, and `outline` was being used as a *selected*
  state elsewhere.

### Fixed — small screens
- **The sidebar pushed the page sideways on a phone** (375 → 463px document
  width). It now slides over the content with a backdrop and closes itself when
  you pick something.
- The Schedule board needed 824px in a plain flex row with no media query; it
  stacks below 900px. Two-column form grids collapse below 640px.

### Fixed — correctness
- **A drag on a month bar also opened the course** — `MonthView.barDown` had no
  moved-guard, unlike its Year and Week equivalents.
- **Filtering by staff hid every course with no trainer** — `String(null)` is
  `'null'`, never in the set, so the blocks an admin is hunting for vanished.
- The legend filled with staff holiday names.
- "Colour by scheme" did nothing (fell through to the course colour); it now
  uses the scheme colour. "Colour by attendance" only ever worked in the Year
  view and is now only offered there.

## 2026-08-28 — Critical fixes

### Fixed
- **`setNonce is not defined` — every calendar write threw.** Introduced in
  v1.8.0: `nonce` was DayPilot's re-render key and was removed with the widget,
  but the `setNonce((n) => n + 1)` call at the end of `refresh()` survived a
  regex that required the call to end the line. `refresh()` therefore threw a
  ReferenceError on every invocation, so: the grid never reloaded after a save,
  `refreshKeepOpen` never reassigned the open block, and the user was shown the
  literal string "setNonce is not defined" after every trainer assignment,
  delegate add, delegate return, attendance change and date edit. A runtime
  error, so `vite build` passed and it shipped. Found by an adversarial audit,
  not by the build.
- **Schedule → Calendar tab leaked every user's private engagements.**
  `CalendarTab` rendered `<CalendarView />` with no props. `user` being
  undefined made it call `listEngagements(undefined, undefined)`, which in
  `api.js` skips the owner/member filter entirely and returns all rows — with
  an ungated Delete button. `isAdmin` being undefined also silently stripped
  every edit control from that tab. `Schedule` now takes `user`/`isAdmin`/`go`
  from `App.jsx` and forwards them.

## 2026-08-27 — v1.8.0 — Calendar rebuilt, set-up wizard

### Added
- **`src/views/SetupWizard.jsx`** — "Set up a course" wizard (nav: Operations →
  Set up a course). Five steps: course → dates → trainer → delegates → check.
  Writes through the existing API (`createBlock` → `assignBlockRole` →
  `addDelegatesToBlock`), so a course created here is an ordinary course.
  The dates step is a real calendar — drag across the days in either Month or
  Year view, with existing blocks shown for context. `MonthView` and `YearView`
  gained a `selection` prop so a committed range stays highlighted after the
  drag ends. `applyRange()` normalises a drag: it orders the ends, snaps them
  inside Mon-Fri, and collapses to a single day when a drag lands entirely on a
  weekend (which would otherwise invert the range — caught by unit test).
  Staff on holiday for the chosen dates cannot be selected; the delegate list
  is filtered to the course's scheme.
- **`MonthView`** in `Calendar.jsx` — our own month grid, exported along with
  `cal()` so the dashboard can reuse it. Week rows, lane-packed multi-day bars,
  drag across cells to create, drag a bar to move, drag its edge to resize.
  All pointer events, so mouse, touch and pen share one path.

### Changed
- **The course panel is a centred modal** (`.cal-modal*`), not a right-hand
  drawer. Full-screen below 640px. Holiday and engagement panels inherit it.
- **The "view or edit?" chooser has been removed.** Admins open a course
  directly with the edit controls inline; everyone else sees it read-only.
- `Dashboard.jsx` "Month at a glance" now renders the shared `MonthView` in
  `readOnly` mode; its bespoke hover card and event-mapping code are gone.
- `YearView` day-cell dragging moved from `onMouseDown`/`onMouseEnter` to
  pointer events with `elementFromPoint` tracking, plus `touch-action:none` on
  `.yc-cell`. `mouseenter` never fires during a touch drag, so year-view
  selection had been desktop-only.

### Removed
- **`@daypilot/daypilot-lite-react`** — the last third-party UI dependency.
  Its free tier could not support touch (a paid feature) and its styling never
  matched the app. With it went `DayPilot.Date` (replaced by the local `cal()`
  helper), the event-mapping layer, `onBeforeEventRender`, `doMoveResize` and
  the render `nonce`.
- **`src/views/Planner.jsx`** — an experimental zooming-timeline calendar built
  earlier the same day and rejected on review. Removed whole, with its nav
  entry, roles entry and CSS.

### Performance
- Bundle **1,490 KB → 1,093 KB** raw, **473 KB → 366 KB gzipped** (−23%).
- Modules 312 → 304.

### Notes
- No database migration.
- All drag targets set `touch-action: none`; `prefers-reduced-motion` respected
  by the new modal, wizard and month grid.
