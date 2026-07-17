---
name: sgas-deploy-flow
description: SGAS deploy = Vercel + Supabase only; Chris never runs local npm/dev steps
metadata: 
  node_type: memory
  type: feedback
  originSessionId: dc76eaa1-0c7c-4144-84b2-56e907073813
---

SGAS ships via **Vercel + Supabase ONLY**. Chris does NOT run anything locally — no `npm install`, no `npm run dev`, no local build. His entire workflow is: GitHub Desktop **commit → push**, and Vercel auto-deploys (runs the install/build itself). Supabase changes are run as SQL in the Supabase SQL editor when a migration is needed.

**Why:** Chris is not a developer running a local toolchain; he tests on the deployed Vercel URL (sgas-opal.vercel.app). Telling him to "npm install locally" is wrong and confusing.

**Live DB trails the code — UNRUN MIGRATIONS cause 400s that look like app bugs (found 27 Jun 2026):** Chris reported "ACS form print broke" + "manually-added delegates missing from the Delegates list". ROOT CAUSE (both): the live Supabase (vyabbdxsatvcmwkuircm) was missing `company.send_to_employer` — the ACS form's FORM_SELECT (`company:company_id(name,address,send_to_employer)`) AND listCompanies both select it, so a missing column 400s the whole query → ACS form returns no data, and the Book/Companies company list errors so a manual delegate add can't complete (client count stuck at the 10 seeds). FIX = run `sgas_company_history.sql` in the Supabase SQL editor (one idempotent ALTER) — NO code change, NO redeploy. Also found `renewal_contact` table missing → run `sgas_renewals.sql`. EVERYTHING ELSE present (probed booking.attend_from/disposition/is_reassessment/rescheduled/flag_cert_outstanding/igas_evidence_date, booking_category.is_reassessment, category.price, course.color, inquiry, mlp, chase_log — all OK). LESSON: when a feature "breaks" in live, probe the live REST API for the columns/tables that feature's query references (node + anon key from .env, fetch `/rest/v1/<table>?select=<col>&limit=1` → 400 "column does not exist" = unrun migration) BEFORE assuming a code regression. Chris runs migrations manually in Supabase and easily misses some.

**ALWAYS PASTE SUPABASE SQL INLINE IN CHAT** (Chris asked, 28 Jun 2026): whenever a change needs a migration, show the full SQL in a fenced sql block in the chat reply so he can copy-paste straight into the Supabase SQL editor. Don't just reference the .sql filename — paste it. Still also save the .sql file in the project folder.

**How to apply:** When I add a dependency, the only action for Chris is to commit+push BOTH `package.json` AND `package-lock.json` (Vercel installs the new dep during its build — Vite bakes env at build time). Never instruct a local npm/dev/build step. State actions as: (1) run SQL X in Supabase (only if a migration exists), (2) commit+push in GitHub Desktop. I build-verify with vite in the sandbox myself; that's MY check, not a step for Chris. Also: do NOT run `git` commands from the sandbox — they leave a `.git/index.lock` the sandbox can't unlink, which blocks his GitHub Desktop commit (had to grant cowork file-delete to clear it). See [[sgas-frontend]], [[sgas-mount-write-gotcha]].
