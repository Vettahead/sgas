---
name: sgas-staff-accreditations
description: "SGAS staff accreditations + expiry — schema, API, Admin panel; what's built vs still to come"
type: project
---

Built 27 Aug 2026 (CORE only — report + dashboard + email alerts deliberately deferred). Driven by Simon's audit at the **beginning of October**. Full client spec in [[sgas-client-meeting-aug26]].

## DESIGN DECISIONS (Chris chose these — don't re-open)
1. **The accreditation list IS the qualification catalogue** (`category` table), not a separate list. Simon explicitly wanted "the same list… so when you reorder that list they'll come through". Two new columns on `category`:
   - `staff_only boolean default false` — an award staff hold but delegates never book (verifier / IQA). Hidden from the booking screens.
   - `staff_requirement text` CHECK in ('MUST','NICE','OPTIONAL'), NULL = not a staff requirement. A GLOBAL policy on the qualification, not per-person.
2. **Evidence = a link + a name field now**, Dropbox API plugs into it later. No file upload built.
3. Scope = add / track / expire. Report + dashboard + email are separate `build` items on the Progress page.

## MIGRATION
`Sgas project/sgas_staff_accreditations.sql` — **ALREADY APPLIED to live** (27 Aug 2026). The .sql file exists for the record; it does NOT need running again. Table:
`staff_accreditation(staff_accreditation_id, staff_id→assessor, category_id→category, achieved_on, years numeric, expires_on, evidence_url, evidence_name, notes, created_at, updated_at)` + **unique(staff_id, category_id)** (one row per person per qual — re-certifying UPDATES in place) + an `updated_at` touch trigger + the usual permissive RLS/grants do-block.
`expires_on` is STORED not derived — the certificate's own date must be able to win over the calculated one.

## API (`src/lib/api.js`, appended at the end)
`STAFF_REQUIREMENTS`, `REQUIREMENT_LABEL`, `WARN_MONTH_CHOICES`, `DEFAULT_WARN_MONTHS=6`; pure `expiryFrom(achievedOn, years)` (whole years move the year, part years move whole months) and pure `accreditationStatus(expiresOn, warnMonths)` → `{state:'none'|'ok'|'due'|'expired', days, label}`; `listAccreditationCatalogue()`, `listStaffAccreditations(staffId=null)` (omit the id for ALL staff — what the report/dashboard will run off), `saveStaffAccreditation()` (upsert onConflict `staff_id,category_id`), `deleteStaffAccreditation()`, `setCategoryStaffFlags()`.
**NEW `listBookableCategories()` = listCategories minus staff_only.** Book.jsx, Schedule.jsx and Calendar.jsx use it; Courses.jsx still uses `listCategories` so the whole catalogue stays manageable there.
Live + demo branches both implemented. `core.js` gained `staffAccreditations` (4 demo rows) and `seq.staffAccred`.

## UI
NEW `src/components/StaffAccreditations.jsx` (props `staffId, staffName, onCount`).
**UI REWORKED same session — Chris called the first attempt "messy".** FIRST attempt added an Accreditations COLUMN + an expanding full-width row to the Admin staff table; the table already had 8 columns and it was too much. **Now: clicking a staff member's NAME opens their own page** (`.staff-link` button sets `accFor`; Admin returns that page early instead of the list, with a `← All staff` `.crumb` button). The staff table is back to its original 8 columns. The ONLY thing added to the list is a small red/amber `.acc-dot` beside a name whose accreditation is expired/expiring, fed by a single `listStaffAccreditations()` (no id = all staff) in a useEffect keyed on `[unlocked, accFor]`, failing silently so the dot never blocks the list. The person's page shows a header card (email · room · login+role · holiday days) then the accreditations panel. Admin.jsx also has a module-level `summarise(rows)` helper and `accFor`/`accCounts` state.
**LESSON: don't bolt extra columns onto the Admin staff table — it is already full. New per-person detail goes on the person's own page.**
Panel: stat chips, a warn-window select (3/6/9/12 months, localStorage `sgas_accred_warn`), a "Required to work here, not on record" strip, an add/edit form (grouped `<optgroup>` by scheme; picking a qual pre-fills `years` from `category.renewal_years`; achieved+years auto-derives expiry but a hand-typed expiry is preserved), and the held table with countdown badges.
styles.css: appended `.accbtn/.acc-dot/tr.accrow/.acchead/.accpanel/.acc-*/.acctable` block.

## VERIFIED
vite build 312 modules OK. Expiry maths unit-tested in node — leap-day 29 Feb + 1yr rolls to 1 Mar (acceptable, overridable); 0.5 years → +6 months; warn boundary inclusive at exactly N months. A live insert/read round-trip was done and the test row deleted.

## STILL TO BUILD
- **Staff qualifications report** — one button, prints everyone with expiry dates + certificates. The audit deliverable.
- **Accreditation expiry alerts** — dashboard panel across all staff + email at the lead time (needs SMTP).
- Simon still owes the extra award list (verifier / IQA) — entered as categories in a staff-only scheme via the Courses screen. **Nothing was seeded — do not invent them.**

See [[sgas-client-meeting-aug26]], [[sgas-frontend]], [[sgas-progress-page]], [[sgas-version-changelog]], [[sgas-deploy-flow]].
