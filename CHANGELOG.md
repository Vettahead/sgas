# Changelog

All notable changes to the SGAS Training Management frontend.
Newest first. The in-app Changelog screen (Settings → Changelog) shows the same
releases in plain English for the client; this file carries the technical detail.

## 2026-08-28 — Calendar (new look): stretching a course

Review: "stretch to new days is hella janky." It was. Three separate faults.

### Fixed
- **The resize never followed the pointer.** `barDown` set
  `el.style.width = Math.max(w * 0.6, el.offsetWidth)` — reading the element's
  own width back each frame, so it wrote the same value repeatedly and only
  jumped on release. The starting width is now measured **once** and the bar is
  sized to `startW + delta * colWidth`.
- **The bar rubber-banded a frame behind the cursor.** `.cx-bar` carries a
  140ms transition on `transform`; a `.dragging` class now removes it, and
  `body.cx-dragging` kills text selection so the grid stops highlighting blue
  mid-drag.
- **After release the bar collapsed to the width of its own text.** The inline
  styles were cleared in a `finally` that ran *after* `await load()` — by which
  point React had already written the correct `width`, so clearing it wiped
  React's value and the bar fell back to `width:auto`. Inline styles are now
  dropped synchronously before any await, and the block is **updated
  optimistically in state** so it stays where it was dropped instead of
  snapping back while the save is in flight. A failed save reloads to revert.

### Changed
- Drags **snap to whole days** as you go, rather than following pixels and
  snapping at the end.
- A **live label follows the pointer** with the dates the drag will produce
  ("06 Jul 2026 – 12 Jul 2026 · 7 days"), so it is not guesswork.
- A course can no longer be dragged shorter than one day.
- The move handle is only on a course's **first** segment and the resize handle
  only on its **last**. Both used to appear on every week a course crossed, so a
  middle segment offered a resize that made no sense.
- Grab areas widened to 18px.

Measured in headless Chromium frame by frame: at +1/+2/+3/+4 days the bar was
762 / 890 / 1018 / 1147px against 762 / 890 / 1018 / 1147 expected, and after
release a 5-day course correctly became 9 days across two week rows.

## 2026-08-28 — Calendar (new look), round two

Review feedback: white modal in dark mode, no resize, no create, missing the
split colour coding, and no way to split a delegate's attendance.

### Fixed
- **The course window was white in dark mode.** `.cal-modal` hardcodes
  `background:#fff`, and `.cx-modal` never overrode it — so the panel was a
  white box with `--cx-ink` (pale) text on it. `.cx-modal` now carries its own
  surface, and `.cx select` / `.cx input` are themed too.

### Added
- **Resize.** A `.cx-resize` handle mirrors the move handle: the left edge
  moves the course, the right edge changes its length, clamped so the end can
  never pass the start. Both are pointer-driven, so both work on touch.
- **Create.** Dragging across days now opens a small New course sheet
  (dates + which course + Create it), which drops you straight into the new
  course's window to add a trainer and delegates. "Use the full set-up instead"
  hands off to the wizard. Previously the drag only raised a toast.
- **Split colour coding, carried over from the calendar people know.** Each bar
  gets a stripe along its bottom edge with one segment per delegate, coloured
  by why they are there — New, Reassessment, Not yet competent, No-show. A
  mixed course now reads without opening it. A legend above the grid decodes it.
- **Splitting a delegate's attendance.** `isPart()` marks anyone with
  `attendFrom`/`attendTo` set: their stripe segment is half-opacity, the bar
  carries a ◧ marker, and their row in the course window shows the dates they
  actually attend. Admins get a "split" control writing through the existing
  `setBookingAttendance`, with "all of it" to clear it.

Verified in headless Chromium: dark modal renders on the dark surface,
3 delegate stripes and 4 resize handles present, drag-to-create opens the sheet
and creates a real course, and a resize grew a bar from 249px to 377px. No
console errors.

## 2026-08-28 — Calendar (new look), on its own tab

### Added
- **`src/views/CalendarNext.jsx`** — a visual revamp of the month calendar,
  added as a separate "Calendar — new look" tab. **The live Calendar, Schedule
  and Set up a course screens are untouched.** All styles are namespaced `.cx-`
  so they cannot leak into the existing calendar.
  - Real type hierarchy: a 26px month title instead of a row of small grey
    buttons, and a single primary action.
  - Bars are tinted with the course colour and carry it as a left edge, with
    the delegate count as a pill and an amber dot when the course is missing a
    trainer or delegates.
  - An agenda rail: what needs attention, what is on in the month being viewed,
    and who is waiting to be placed — scoped to the visible month, so it never
    contradicts the grid.
  - Comfortable / Compact density, and a **dark mode** (`.cx-dark`), both
    remembered per browser.
  - Motion that carries meaning: the grid slides in the direction of travel,
    a moved course pulses once on landing, skeleton cells while loading.
  - Rows size themselves to the number of stacked courses rather than always
    rendering six weeks.
  - The course window puts the trainer, the roster and the waiting list in one
    place, with the waiting list as tappable chips — the drawer's job, done in
    a window.
  - Reuses the shared `Modal`, so Escape, the focus trap and `role="dialog"`
    come with it.

Rendered and checked in headless Chromium at 1500px and 390px, light and dark,
with no console errors.

## 2026-08-28 — Calendar correctness pass

Driven by an adversarial audit against Google Calendar. Verified in a real
headless browser (Playwright + Chromium) at 375px and 1440px, not just by
`vite build` — the `setNonce` crash proved a passing build means very little.

### Fixed — losing work
- **New shared `src/components/Modal.jsx`.** Every modal now: closes on
  Escape, traps Tab, is `role="dialog"` with an accessible name, focuses its
  first control on open, restores focus on close, locks background scroll, and
  **asks before discarding** when there is unsaved input. Previously none of
  the four modals did any of this, and the backdrop silently binned typed input.
- **`CreateModal` was a trap** — its overlay had a `stopPropagation` guarding a
  handler that did not exist, so neither backdrop nor Escape closed it.
- **The wizard no longer loses five steps to a stray sidebar click.** The draft
  is kept in `localStorage` (`sgas_setup_draft`), restored on return with a
  "Picked up where you left off / Start again" notice, and cleared once the
  course is created.
- **A single tap no longer opens the New Block form.** `MonthView.cellDown`
  fired `onCreate` even when start === end, so looking at a day meant
  dismissing a dialog. Only a genuine multi-day drag creates now.
- **Date fields commit on blur, not on change.** A native date input fires
  `change` per edited component, so typing a date issued an `updateBlock` per
  keystroke, mostly for nonsense intermediate dates.

### Fixed — touch
- **Every remaining mouse-only drag is now pointer-driven.** Year-view bar
  move/resize and the entire Week/Day view used `mousedown`/`mousemove`, which
  never fire for a touch drag — rescheduling a course by dragging was
  impossible on a tablet. `e.button` guards now tolerate a missing button.
- `pointercancel` is handled and listeners are removed on every path. Without
  it a cancelled touch drag left listeners attached, and the *next* tap
  anywhere opened a New Block modal for a range nobody chose.
- **Drag handles were 7–8px and invisible until `:hover`** — which does not
  exist on touch. The visual stays slim; the grab area is padded out via
  `::after`, handles are always visible under `@media (hover:none)`, and touch
  targets there go to 40px.
- The month and year grids had `touch-action:none` on every cell, so on a phone
  the grid swallowed scrolling and every attempt started a drag. Now `pan-y`
  below 640px.

### Fixed — keyboard
- **The whole sidebar was unreachable by keyboard** — `<a>` with no `href` is
  not in the tab order. Now `<button>` with `aria-current`.
- Visible `:focus-visible` rings across buttons, chips, nav, bars and links.
  Only inputs had focus styling, and `outline` was being used as a *selected*
  state elsewhere.

### Fixed — small screens
- **The sidebar pushed the page sideways on a phone** (375 → 463px document
  width). It now slides over the content with a backdrop and closes itself when
  you pick something.
- The Schedule board needed 824px in a plain flex row with no media query; it
  stacks below 900px. Two-column form grids collapse below 640px.

### Fixed — correctness
- **A drag on a month bar also opened the course** — `MonthView.barDown` had no
  moved-guard, unlike its Year and Week equivalents.
- **Filtering by staff hid every course with no trainer** — `String(null)` is
  `'null'`, never in the set, so the blocks an admin is hunting for vanished.
- The legend filled with staff holiday names.
- "Colour by scheme" did nothing (fell through to the course colour); it now
  uses the scheme colour. "Colour by attendance" only ever worked in the Year
  view and is now only offered there.

## 2026-08-28 — Critical fixes

### Fixed
- **`setNonce is not defined` — every calendar write threw.** Introduced in
  v1.8.0: `nonce` was DayPilot's re-render key and was removed with the widget,
  but the `setNonce((n) => n + 1)` call at the end of `refresh()` survived a
  regex that required the call to end the line. `refresh()` therefore threw a
  ReferenceError on every invocation, so: the grid never reloaded after a save,
  `refreshKeepOpen` never reassigned the open block, and the user was shown the
  literal string "setNonce is not defined" after every trainer assignment,
  delegate add, delegate return, attendance change and date edit. A runtime
  error, so `vite build` passed and it shipped. Found by an adversarial audit,
  not by the build.
- **Schedule → Calendar tab leaked every user's private engagements.**
  `CalendarTab` rendered `<CalendarView />` with no props. `user` being
  undefined made it call `listEngagements(undefined, undefined)`, which in
  `api.js` skips the owner/member filter entirely and returns all rows — with
  an ungated Delete button. `isAdmin` being undefined also silently stripped
  every edit control from that tab. `Schedule` now takes `user`/`isAdmin`/`go`
  from `App.jsx` and forwards them.

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
