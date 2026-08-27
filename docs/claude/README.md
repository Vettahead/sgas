# Claude project knowledge — SGAS

These files are Claude's accumulated working knowledge of the SGAS app (Jun 2026 sessions),
imported into the repo on 17 Jul 2026 and refreshed 27 Aug 2026 so any session can read them. **Start with `MEMORY.md`**
(the index), then `sgas-frontend.md` (architecture + full build history).

| File | What it covers |
|---|---|
| `MEMORY.md` | Index of all the notes below |
| `sgas-client-meeting-aug26.md` | **Start here** — 27 Aug 2026 client catch-up: verified live state, October deadlines, the agreed next builds |
| `sgas-version-changelog.md` | Version badge + Changelog screen — **bump `RELEASES` in src/lib/version.js every session** |
| `sgas-staff-accreditations.md` | Staff accreditations + expiry — schema, API, Admin panel; core built 27 Aug 2026 |
| `sgas-frontend.md` | Architecture, status, and the full session-by-session build history |
| `sgas-calendar.md` | In-app Calendar (Month/Week/Day/Year, drag, holidays, engagements) — replaces Teamup |
| `sgas-demo-backlog.md` | Post-demo backlog; only item 4 (staff quals + expiry) left to build |
| `sgas-deploy-flow.md` | Deploy flow: Vercel + Supabase only; migration gotchas; paste SQL inline for Chris |
| `sgas-doc-generation.md` | §4.7 ACS application-form auto-fill (pdf-lib overlay); open GN8 rule |
| `sgas-help-faq.md` | In-app Help & FAQ page + per-page "?" popover |
| `sgas-progress-page.md` | In-app Roadmap/Progress page — **update ITEMS + UPDATED every session** |
| `sgas-mount-write-gotcha.md` | Old sandbox mount truncation bug (historical — see below) |

## ⚠ Read with the CLOUD workflow in mind (Jul 2026 onward)

These notes were written when Claude worked on Chris's Windows PC via a mounted folder and
Chris committed/pushed via GitHub Desktop. The project has since moved to a **fully cloud
workflow** (Claude Cowork cloud sandbox, "Sgas - Cloud" project). Differences:

- **Claude now clones, commits, and pushes directly** (author must be
  `Vettahead <139481846+Vettahead@users.noreply.github.com>` or Vercel blocks the deploy).
  The old "NEVER run git in the sandbox" rule is obsolete.
- **The mount-write/truncation gotcha does not apply** — there is no Windows mount.
  `sgas-mount-write-gotcha.md` and the many mount warnings in the other files are historical.
- Claude applies Supabase migrations directly via the Supabase connector (project
  `sgas-demo`, ref `vyabbdxsatvcmwkuircm`) rather than only pasting SQL for Chris —
  though pasting the SQL in chat as a record is still good practice.
- Claude verifies each Vercel deploy is READY after pushing (Vercel connector).
- Chris still does not run anything locally — that part is unchanged.

Still-current conventions: update the in-app Progress page (`src/views/Roadmap.jsx`
ITEMS + UPDATED) every session; keep Help.jsx SECTIONS in sync with features;
text inputs need `type="text"`; probe the live DB for missing columns before
assuming a code regression.

One redaction: the seeded admin password in `sgas-frontend.md` is redacted because this
repo is public.
