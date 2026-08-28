# Changelog

All notable changes to the SGAS Training Management frontend.
Newest first. The in-app Changelog screen (Settings → Changelog) shows the same
releases in plain English for the client; this file carries the technical detail.

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
