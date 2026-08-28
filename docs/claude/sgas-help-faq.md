---
name: sgas-help-faq
description: "SGAS in-app Help & FAQ page — plain-English guide for all roles, search + collapsible, code-maintained"
metadata: 
  node_type: memory
  type: project
  originSessionId: 93570d26-96e1-4c31-b4af-f1808d7d84b5
---

In-app **Help & FAQ** page built 29 Jun 2026 (Chris: "feature complete faq for the site on how everything works… users won't be technical… be exhaustive"). NEW file `src/views/Help.jsx` (default export `Help`). Available to **ALL roles** (everyone needs help) — `roles.js` added `'help'` to every ROLE_VIEWS list. App.jsx: import Help, `TITLES.help`, NEW nav group `{ grp:'Help', items:[{v:'help',ic:'❓',label:'Help & FAQ'}]}` after Settings, render `{activeView==='help' && <Help />}` (NOT gated — all roles). styles.css: appended `.help-*` block. NO DB / no migration. Build-verified (vite OK in /tmp/sgashelp).

**Structure:** hardcoded `SECTIONS` array (16 sections: Getting started, Roles, Dashboard, Inquiries, Booking, Scheduling, Calendar, Assessing, ACS forms, Payments, Delegates, Companies, Courses, Admin, Progress page, Tips/troubleshooting). Each item = {q, a:[paragraph lines; a line starting "•" renders as a bullet list]}. Top card has a **search box** (filters across q+a, force-opens matching sections, hides non-matches), a row of **jump chips** (scroll+open a section), and a `UPDATED` date. Sections are collapsible cards reusing the app's `.card.collapsible/.card-toggle/.chev/.card-count` pattern (same as Roadmap). Open state saved to localStorage `sgas_help_open`. `UPDATED='29 Jun 2026'`.

**To maintain:** edit the `SECTIONS` array in Help.jsx and bump `UPDATED`. It's plain data — quick edit, commit+push, no SQL. Keep it in sync as features change.

**Roadmap updated** same session: added a `review` ("To show client") item "In-app Help & FAQ" to `src/views/Roadmap.jsx` build section + bumped its UPDATED to 29 Jun 2026 (the old `later` item "In-app FAQ + per-page wizards" stays — wizards still to build). See [[sgas-progress-page]].

**Mount gotcha hit again:** Edit-tool edits to App.jsx + roles.js left the bash MOUNT copies truncated mid-file (Help refs present but tails cut). Help.jsx (new file) + styles.css (bash append) synced fine. Fixed App.jsx/roles.js by `git show HEAD:path > /tmp` then python str.replace replay → write to mount → vite build OK. Chris's Windows/GitHub deploy reads the correct files regardless. See [[sgas-mount-write-gotcha]], [[sgas-frontend]], [[sgas-deploy-flow]].

**Per-page "?" help button (29 Jun 2026):** Chris wanted contextual help on every page top-right, not just the FAQ tab. Help.jsx now EXPORTS `SECTIONS`, `Answer`, and `VIEW_HELP` (map: view key → section id[]; e.g. dash→['dashboard','basics'], assess→['assess','acs'], admin→['admin','roles'], sched→['schedule']; no 'help' entry so the button hides on the FAQ page itself). NEW `src/components/PageHelp.jsx` = a round "?" button rendered in App.jsx `.top .right` (`<PageHelp view={activeView} onOpenFaq={()=>go('help')} />`); click → popover showing that page's section(s) Q&A (reuses the exported `Answer`), closes on outside-click/Esc, with an "Open the full Help & FAQ →" link. ONE content source (SECTIONS) drives both the FAQ page and the popover. styles.css: appended `.pagehelp-*` block. Build-verified.

**Chris action:** GitHub Desktop commit+push (Vercel auto-deploys). NO Supabase migration. Files: src/views/Help.jsx, src/components/PageHelp.jsx (NEW), src/App.jsx, src/lib/roles.js, src/styles.css, src/views/Roadmap.jsx.

**IMPORTANT — DON'T run git in the sandbox:** a sandbox `git status`/`git show` left a stale `.git/index.lock` that the sandbox can't unlink (Operation not permitted) and it BLOCKED Chris's GitHub Desktop commit until he deleted `...\sgas-app\.git\index.lock` by hand. For build-verify, copy mount src → /tmp + `npm install` there; never touch git. See [[sgas-deploy-flow]].
