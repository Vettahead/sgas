---
name: sgas-version-changelog
description: "SGAS version badge (sidebar foot) + Changelog screen — code-maintained, MUST bump every session"
type: feedback
---

Built 27 Aug 2026 (Chris: "lets add a version in the bottom left on the taskbar (count how many pushed) and a changelog in admin too").

**Single source: `src/lib/version.js`** — exports `RELEASES` (array, NEWEST FIRST, each `{v, build, date, title, notes:[]}`), plus `VERSION`/`BUILD`/`RELEASE_DATE` derived from `RELEASES[0]`, and `COMMIT`.

**`COMMIT` is injected at build time.** `vite.config.js` now has `define: { __COMMIT__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA||'').slice(0,7)) }`. Vercel sets that env var; locally it's empty so `COMMIT` falls back to `'dev'`. This is the fix for the recurring "which build is actually live?" problem — the Changelog page shows the live push's short SHA.

**Where it shows:**
- Sidebar `.foot` (bottom-left): `v1.6.0 build 105`. Admins get a clickable `<button className="verbadge">` → `go('changelog')`; non-admins get a static div. Hidden when the sidebar is collapsed (`.app.nav-collapsed .side .foot{display:none}`).
- NEW `src/views/Changelog.jsx` (default export `Changelog`) — big current version card (version, build, date, live commit, release count, a plain-English note explaining what build number / commit mean) then one card per release. Pure data, no DB.
- Nav: `roles.js` ADMIN views gained `'changelog'` (after `roadmap`); App.jsx got the import, `TITLES.changelog`, NAV_GROUPS Settings item `{v:'changelog', ic:'📝', label:'Changelog'}` after Progress, and `{activeView==='changelog' && isAdmin && <Changelog/>}`. It's a Settings-group page, NOT inside Admin.jsx — Chris said "in admin", I put it in the admin area as its own page (Admin.jsx is already crowded); one line to move if he'd rather it were a tab there.
- styles.css: appended `.verbadge/.verbuild` + `.cl-*` block at the end.

**WORKFLOW — DO THIS EVERY SESSION (same convention as [[sgas-progress-page]]):** add a new entry to the TOP of `RELEASES` describing what changed in plain English (this is client-facing), set `build` to the repo's commit count, bump `v` (minor = new feature, patch = fix). Read the commit count with `wc -l < .git/logs/HEAD` — do NOT run git (see [[sgas-deploy-flow]]). At 27 Aug 2026 the local reflog was 104 lines + 1 origin-only commit = build 105.

Backfilled 8 releases from v0.1.0 (7 Jun, first live) → v1.6.0 (27 Aug). Build-verified (vite OK in /tmp/sgasv6).

See [[sgas-progress-page]], [[sgas-frontend]], [[sgas-deploy-flow]].
