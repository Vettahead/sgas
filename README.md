# SGAS Training Management — Frontend

React + Vite single-page app for the SGAS training-management system, wired to
the live Supabase database (the schema built in `../sgas_setup_supabase.sql`).
It is the React port of `../sgas_mockup.html`.

## Running it

```bash
cd sgas-app
npm install
npm run dev
```

Then open http://localhost:5173.

## Connecting to Supabase

The app reads two values from a `.env` file (already created for this project):

```
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

- Both come from the Supabase dashboard → **Project Settings → API**.
- The publishable / anon key is the **public** key and is safe in the frontend.
- **Never** put the `service_role` / secret key here.

**Demo mode:** if `.env` is blank or missing, the app runs entirely on bundled
demo data (`src/lib/demo.js`) with no database — useful for design review. A
badge in the top-right shows **● LIVE** or **● DEMO** so you always know which.

## Staff accounts & sign in (app-managed — NOT Supabase Auth)

Staff accounts live in your own `app_user` table and are managed from the in-app
**Admin** screen (visible to Admins only). Logins are **verified inside Postgres**
with bcrypt; the accounts table is locked by RLS so the public key cannot read
password hashes or list users — all access goes through `SECURITY DEFINER`
functions.

**One-time setup (live mode):** in the Supabase SQL editor run, in order:

1. `../sgas_secure_auth.sql` — staff accounts, DB-enforced login, seeds the admin.
2. `../sgas_staff_and_roles.sql` — adds the shared Staff fields, the Trainer/Verifier role slots on each block, and the Teamup designator columns (needed by the new Schedule + Staff screens).

`sgas_secure_auth.sql` also seeds the first admin:

- username **`vettahead@gmail.com`** · password **`Orinjepson1802`** (change it from Admin).

Then sign in, open **Admin**, confirm your password to unlock, and add staff.
Admin actions re-verify your password in the database each session.

Demo mode (no `.env`) uses in-memory accounts: `admin` / `demo` or `reception` / `demo`.

### Security scope

This hardens **authentication** and protects the credentials table. The
operational data tables (`client`, `booking`, …) still use the permissive test
RLS — locking those per-user is the next step, and depends on how you host the
app (a public host means the anon key ships to browsers; a JWT/role layer would
be added then). Fine as-is for local/internal use.

## Screens

| Screen | What it does | Data |
|---|---|---|
| Dashboard | Renewal engine (expiring ≤90 days), session count, outstanding to chase | reads `v_live_qualification` + bookings |
| Book a Delegate | Pick/add delegate + company, tick qualifications → unscheduled pool | reads clients/companies/categories; writes new client/company |
| Schedule | Course blocks (from Teamup) — assign Trainer + Assessor + Verifier and add delegates; all three roles required; calendar view | reads blocks/staff/pool; writes role assignments + bookings |
| Staff | Shared people list (trainer/assessor/verifier), each with a Teamup sub-calendar | reads/writes staff |
| Assess | Flip each booked qualification to pass/fail; expiry auto-calculated by the DB trigger | reads/writes `booking_category` |
| Payments & chase | Toggle MLP / IGAS / payment flags, chase | reads/writes `booking` flags |
| Delegates | Search by name / NI / company; open one for full accreditation history | reads `client` + `booking` history |
| Companies / Assessors / Courses | Reference record tables | reads |

## Architecture

- `src/lib/supabase.js` — creates the client; `LIVE` is true when env keys are set.
- `src/lib/api.js` — the **only** place that talks to data. Every function returns
  the same shape whether the source is Supabase or demo, so views are source-agnostic.
- `src/lib/demo.js` — in-memory dataset shaped like the real tables.
- `src/views/*` — one file per screen.

## Known gap to decide (carried over from the build brief)

The **unscheduled pool** (draft bookings made at reception before an assessor/date
is assigned) is currently **client-side staging only** — it lives in memory until
you schedule it, at which point real `session` + `booking` rows are written to
Supabase. To let one person book and another schedule later (the decoupling the
brief wants), `booking.session_id` needs to become nullable (or a small `draft`
table added) so drafts persist server-side. One-line schema change; flagged for
your call before real data goes in.
