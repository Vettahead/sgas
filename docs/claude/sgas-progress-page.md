---
name: sgas-progress-page
description: "SGAS in-app Progress/Roadmap page — admins-only, code-maintained; MUST update each session"
metadata: 
  node_type: memory
  metadata_type: feedback
  type: feedback
  originSessionId: f9345bb3-ce75-43d0-b839-854fa7ca8817
---

In-app **Progress page** built 28 Jun 2026 (Chris's request: "a separate page on the app for us to track where we are, what's done, what needs doing… make it in your workflow to update that"). File: `src/views/Roadmap.jsx` (default export `Roadmap`). Admins-only — `roles.js` ADMIN views include `'roadmap'`; App.jsx renders it gated `isAdmin`, nav under **Settings** group (🗺 "Progress"), TITLES.roadmap. No DB / no migration — the task list is a hardcoded `ITEMS` array in the file.

**Why code-maintained:** Chris chose "I maintain it in code" + "Admins only" (AskUserQuestion). He expects ME to keep it current.

**WORKFLOW CONVENTION (Chris, 28 Jun 2026 — FOLLOW EVERY SESSION):** when I START building a task, set its `s:'progress'` ("In progress"); when it's BUILT, set `s:'review'` (label **"To show client"** — this is Chris's demo list of what we've done); after Chris has DEMOED it to the client he clicks "✓ Shown to client" (or tells me) → set `s:'done'`. So the lifecycle is build → progress → review(show client) → done. Always bump `UPDATED`.

**How to apply — DO THIS EVERY SGAS SESSION:** whenever work lands or a status changes, edit `ITEMS` in `src/views/Roadmap.jsx` (set the item's `s`) and bump the `UPDATED` constant. Statuses: `progress · review · build · future · chris · simon · later · done` (`future` = "On the radar" = bigger pieces discussed but not started/resolved: Sage integration build, security hardening, quotes/VAT, PO numbers, doc pool, reporting, GDPR wording, etc.) (STATUS map drives colours + the summary tiles + % bar). Add new items as `{ t, s, d }`. It's pure data — a quick edit, then commit+push (no SQL). The page shows a progress bar (done/total), per-status count tiles, sections in ORDER (build→chris→simon→later→done), Done collapsible at the bottom.

**Interactive bits (localStorage only):** Waiting-on items can be re-assigned and progressed live; overrides save to `localStorage` key `sgas_roadmap_moves` (keyed by item TITLE), code stays the seed/default. Buttons: Chris item → `→ Simon`; Simon item → `→ Chris` + `✓ Complete` (moves it to the **`review`** bucket = "To review", STATUS rose #be185d, so Simon's finished work lands with Chris to check); Review item → `↩ Simon`. `setStatus(title,to)` clears the override when `to===baseOf(title)` (code default). `eff(it)` applies an override only when base s is chris/simon (override value may be chris/simon/review). `view` drives counts+tiles. ORDER = build·review·future·chris·simon·later·done. Items can NEST: child has `parent:'<id>'`, renders indented under the item with that `id` (used for Sage → Invoicing/Chasing/Quotes/PO, which fall away if Sage can't be done). NO confirm-done button — when Chris reviews & confirms, move the item to `done` in code (bump UPDATED). Everything else read-only/code-maintained. (Per-device only — shared across users would need a DB table.)

The full item set (68 as of 28 Jun 2026: 26 done, build, future="On the radar", chris, simon, later) was enriched from `Sgas project/SGAS_roadmap.md` (§4–§5) + the demo backlog — Done covers the whole journey (auth/roles, book, schedule drag&drop, assess, payments, delegates, companies, courses, pricing, postcode, inquiries, MLP, ACS forms, calendar, holidays, branding), not just recent calendar work.

Mirror of the same content lives in `Sgas project/SGAS_battle_plan.md` (the markdown battle plan from the walkthrough transcript). Keep the two roughly in sync. See [[sgas-demo-backlog]], [[sgas-frontend]], [[sgas-deploy-flow]].
