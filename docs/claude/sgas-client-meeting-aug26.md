---
name: sgas-client-meeting-aug26
description: "SGAS client catch-up 27 Aug 2026 — verified live state, hard October deadlines, the agreed next builds and who owes what"
type: project
---

Client catch-up with Simon (transcript, 27 Aug 2026) after a ~2-month gap. Session was catch-up only — no feature work beyond the version badge + changelog. Everything below is now IN `src/views/Roadmap.jsx` (the in-app Progress page, UPDATED bumped to 27 Aug 2026) and mirrored in `Sgas project/SGAS_battle_plan.md`.

## VERIFIED LIVE STATE (checked directly, 27 Aug 2026 — don't re-litigate)
- **Supabase `vyabbdxsatvcmwkuircm`: EVERY migration is applied.** Confirmed via MCP: `app_user.staff_id`, `company.send_to_employer`, `booking.session_id` nullable (pool_persist), `booking.attend_from`, `category.price`, `course.color`, `course.scheme`, `booking_category.is_reassessment`, the NYC CHECK, `app_create_user` RPC, and tables `inquiry`/`renewal_contact`/`holiday`/`engagement`/`engagement_member`. **No outstanding SQL.**
- Data state: 110 categories, 18 courses, **0 categories have a price**, only 4 of 18 courses have a colour, 4 categories still orphaned in scheme "Other", 9 staff, 6 logins.
- Staff rows: real = Denis Brown(6), Jennifer Gadsdon(9), Keith Rinmer(7 — TYPO, should be Rimmer, holds the login), Philip Rossall(8), Simon Gadsdon(5). **Delete these seeds:** S Johnston(1), Keith Rimmer(2 — the dupe with no login), A Calvert(3), D Nuttall(4).
- **Vercel:** team `team_nACzQmlAWdxQhFK0CcZeteHO`, project `prj_tgf3bo54uNynkuHgclWrD7ExhoQN`, live at sgas-opal.vercel.app. The MCP Vercel tools work — `list_deployments` gives the live commit SHA + message, which is the reliable way to answer "is my change live yet". `list_projects` needs the teamId (get it from `list_teams`; an empty string fails).
- **The 17 Jul commit `2f2db4d` "docs: import Claude project knowledge into docs/claude"** was made by a different (Fable) Claude session and had NOT been pulled locally. Chris pulled it 27 Aug — local, origin and production are now all on `2f2db4d`. **`sgas-app/docs/claude/` is a committed MIRROR of this project memory** (MEMORY.md + the sgas-*.md topic files + a README) so any session can read it from the repo. **Refresh it whenever you write a new memory file** — I updated it 27 Aug with this note + sgas-version-changelog.

## HARD DATES
- **Teamup subscription expires OCTOBER** — the in-app calendar must be in real use before then. Simon offered to renew if needed; Chris said no.
- **Simon has an audit at the BEGINNING OF OCTOBER** — this is what drives staff accreditations. Simon's line: even unfinished, showing the auditor "this is the system we're working under" counts, because audits ask what you're working towards.
- **Simon in Australia from 11 September.** Jen comes in **Wednesday** for the Sage session.

## THE NEXT BUILD — staff accreditations + expiry (fully specced now)
Click a staff member in Admin → their accreditation list. The dropdown **reuses the SAME qualification list as Courses, grouped and ordered identically** (so re-ordering the catalogue re-orders this — Simon explicitly asked for that), PLUS extra awards not in the course catalogue (verifier / IQA — Simon to supply the list). Each accreditation tagged **Must have / Nice to have / Optional** (must-have = the base requirement to work at SGAS). Per accreditation: **date achieved, how long it lasts, expiry date, scanned certificate**. Display = a countdown exactly like the existing Delegates "Qualifications & renewals" card (Simon pointed at it: "achieved, expired, and a countdown — like that one telling you this guy's expired seven days ago"). Configurable warning lead time (he floated 12 or 8 months). Email alert once SMTP lands. **A "Staff qualifications" report button** — press it, it prints the lot for the auditor. **A staff panel on the dashboard** flagging expiring/expired.

## OTHER AGREED BUILDS
- **Delete for staff / logins / delegates.** Only disable exists. Real people stay disabled (keep history); seed records delete outright. Simon asked for this twice.
- **Booking wizard (question tree).** Whoever answers the phone: Gas → commercial or industrial → initial or reassessment → work-experience questions → "this is the course you need" + dates → "book it?" → name, email, auto-request photo ID. Unresolvable cases refer to Simon. **Build it as a reusable engine — the same tree goes on the website later for self-service booking.** This is THE thing that gets Simon off the phone and out of teaching; he named it as the key to freeing himself. Simon maps the questions.
- **Dropbox document storage — Chris chose "build the Dropbox API integration now"** (over a Supabase-Storage stopgap). Portfolios (all paper today), staff certificates, delegate ID. Folder auto-created per delegate and per staff member. Explicitly NOT on the web server — Simon: "if you start sticking all that information on a web server it's going to cost you a fortune". Needs a Dropbox app key from Chris.
- **Payments: paid / part-paid (deposit) / unpaid**, pulled back from Sage, outstanding balance per delegate, surfaced on the Inquiries screen when that person rings again, and as a dashboard list. Means **Keith stops needing his own Sage login**.
- Tidy-ups gained: **confirm the Courses catalogue saves on change** — Simon lost ~20 min of tidy-up edits last time and it was never established whether it saved.

## SAGE (Jen session Wednesday)
Sage Business Cloud Accounting, REST API + **OAuth** — Jen signs into SGAS with her Sage credentials and the two talk. Flow: course names matched to Sage names BY HAND (Simon + Jen) → bookings generate a **draft** invoice in Sage for Jen to check/release → payment state comes back the other way. Sage access still not obtained.

## ACCESS DATABASE (the last big blocker)
Simon drops the **full Access file into Dropbox and sends the link** — the raw database, NOT a spreadsheet export (Chris: a spreadsheet would be unusable; the raw file keeps tables + relationships). Chris sends a **data-handling form** to sign first (paper trail). Then: map Access fields → SGAS fields, load customers, and **because the Access records hold who taught and who assessed, backfill the calendar with the course history** at import time.

## PARKED (added to Later)
- **Phone app + calendar sharing** — staff see their week on their phone; subscribe from an ordinary calendar app.
- **Exam delivery on the ~30 training-room PCs** ("the flash stuff"). Delegate signs in at an assigned workstation, confirms DOB (anti-cheat), sees only their courses that day, papers + job instructions + PDFs open in tabs, question matrix, optional timers. Machines wiped to a browser only, on a separate VLAN, whitelisted to this domain. Chris's parallel IT work: Win10 EOL → Win11 + SSO/Entra, Wi-Fi 6 APs, separating the customer network from the staff network, MAC/VLAN split, moving the on-prem data off the shared network.

## POSTCODE
Currently on the FREE postcodes.io (postcode-level only — town/county, no house-number dropdown). Chris to re-set up the getAddress.io + Ideal Postcodes trials, compare cost, pick one; then it's a small swap.

See [[sgas-frontend]], [[sgas-progress-page]], [[sgas-version-changelog]], [[sgas-deploy-flow]], [[sgas-demo-backlog]].
