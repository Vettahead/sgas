---
name: sgas-deploy-flow
description: SGAS deploy = Vercel + Supabase only; Chris never runs local npm/dev steps; ALWAYS end a session with a paste-ready commit Summary + Description
type: feedback
---

SGAS ships via **Vercel + Supabase ONLY**. Chris does NOT run anything locally — no `npm install`, no `npm run dev`, no local build. His entire workflow is: GitHub Desktop **commit → push**, and Vercel auto-deploys (runs the install/build itself). Supabase changes are run as SQL in the Supabase SQL editor when a migration is needed.

**Why:** Chris is not a developer running a local toolchain; he tests on the deployed Vercel URL (sgas-opal.vercel.app). Telling him to "npm install locally" is wrong and confusing.

## ⚠ ALWAYS GIVE A COMMIT SUMMARY + DESCRIPTION (Chris, 27 Aug 2026 — EVERY SESSION)
Chris asked for this as a standing instruction: **every time work is ready to push, end the reply with a paste-ready commit message in a fenced code block**, matching GitHub Desktop's two fields:

- **Summary** — one line, imperative, ~60 chars or under. It is the label in the repo history and the text Vercel shows against the deployment, so it must be recognisable at a glance six months later.
- **Description** — the body. Short bullets covering WHAT changed and WHY, in plain English (Chris shows this to the client). Name the screens, not the file paths. Flag anything that needs an action, e.g. a Supabase migration.

**Rules:**
- **NO AI attribution.** No "Co-Authored-By", no "Generated with", no mention of Claude anywhere. Write it as if Chris wrote it. (Global preference — applies to every repo of his.)
- UK spellings.
- Give it even for a one-file tweak — a short Summary and a one-line Description is fine.
- If a session produced several distinct pieces of work, offer it as ONE message covering the lot (he pushes once), unless he says he wants them split.
- Put it at the very END of the reply so it's easy to find and copy.

Also see the standing rule to **PASTE SUPABASE SQL INLINE IN CHAT** (Chris, 28 Jun 2026): whenever a change needs a migration, show the full SQL in a fenced `sql` block so he can copy-paste straight into the Supabase SQL editor. Don't just reference the .sql filename — paste it. Still also save the .sql file in the project folder.

## Live DB trails the code — UNRUN MIGRATIONS cause 400s that look like app bugs (found 27 Jun 2026)
Chris reported "ACS form print broke" + "manually-added delegates missing from the Delegates list". ROOT CAUSE (both): the live Supabase (vyabbdxsatvcmwkuircm) was missing `company.send_to_employer` — the ACS form's FORM_SELECT (`company:company_id(name,address,send_to_employer)`) AND listCompanies both select it, so a missing column 400s the whole query. FIX = run `sgas_company_history.sql` in the Supabase SQL editor (one idempotent ALTER) — NO code change, NO redeploy. LESSON: when a feature "breaks" in live, check the live DB for the columns/tables that feature's query references BEFORE assuming a code regression. **As of 27 Aug 2026 every migration IS applied — see [[sgas-client-meeting-aug26]].** The **Supabase MCP tools work** (`list_tables`, `execute_sql` against project `vyabbdxsatvcmwkuircm`) — that is now the fastest way to check.

## Checking what is actually live
The **Vercel MCP tools work**: `list_teams` → `team_nACzQmlAWdxQhFK0CcZeteHO`, then `list_deployments` with projectId `prj_tgf3bo54uNynkuHgclWrD7ExhoQN` gives the live commit SHA + message. The app now also shows the live commit on its own Changelog screen — see [[sgas-version-changelog]].

**Pull before pushing.** A 17 Jul 2026 commit made by a different Claude session sat unpulled locally for two months. Check `.git/logs/HEAD` (read it, don't run git) against the live deployment's SHA at the START of a session; if they differ, tell Chris to hit **Pull origin** in GitHub Desktop first.

**How to apply:** When a dependency is added, the only action for Chris is to commit+push BOTH `package.json` AND `package-lock.json` (Vercel installs it during its build — Vite bakes env at build time). Never instruct a local npm/dev/build step. State actions as: (1) run SQL X in Supabase (only if a migration exists), (2) commit+push in GitHub Desktop with the Summary/Description supplied. Build-verification with vite is MY check, not a step for Chris.

**Do NOT run `git` commands** from a sandbox/agent shell — they leave a `.git/index.lock` that can't be unlinked, which blocks his GitHub Desktop commit. Read `.git/logs/HEAD` and `.git/refs/remotes/origin/main` directly instead.

See [[sgas-frontend]], [[sgas-mount-write-gotcha]], [[sgas-version-changelog]], [[sgas-client-meeting-aug26]].
