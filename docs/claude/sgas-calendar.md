---
name: sgas-calendar
description: "SGAS in-app Calendar — views, drag (blocks AND delegates/staff), holidays, engagements+members; replaces Teamup"
type: project
---

The SGAS Calendar replaces Teamup. Central file: `src/views/Calendar.jsx` (large). Library: DayPilot Lite (`@daypilot/daypilot-lite-react`, Apache 2.0) — only `DayPilot` + `DayPilotMonth` are imported.

## ⚠ "THE CALENDAR ISN'T DRAG AND DROP ANY MORE" — 27 Aug 2026, diagnosed
Chris reported this. **Nothing was broken.** Two real causes, both addressed:
1. **The calendar had NO drag-and-drop for DELEGATES** — that only existed on the Schedule screen; the calendar's Arrange panel used a ＋ button. **FIXED 27 Aug: drag a delegate from the waiting pool onto the "On this block" section, and drag a staff chip onto the trainer slot — matching Schedule.jsx. ＋ / ↩ kept.** In `BlockDrawer`: a `drag` useRef + `over` state, `.cal-drop`/`.cal-drop.over` targets, draggable `<li>` pool rows, `.staffdrag` `.asr-chip.sm` chips. Only active when `editing` (admin + Edit view).
2. **The calendar looked EMPTY.** Live data: 27 blocks, only 1 dated today-or-later; all three Aug 2026 blocks had already finished. **`showFinished` already DEFAULTS to `true`** — the offer to "flip the default" was wrong, it was already right; his browser had a saved `false`. **FIXED instead: a `.banner` reading "N finished blocks are hidden — Show them"** whenever the filter hides anything, via a `hiddenFinished` useMemo.
**LESSON: check the DATA before assuming a code regression.** Also: the waiting pool only renders when `editing`, so in Staff view scheduling correctly appears absent.

## Views
Month (DayPilotMonth, native move/resize/create) · Week · Day · Year. Week/Day and Year are CUSTOM components. **Block drag-move/resize works in ALL FOUR views** (the old note that Year was view+create only is out of date).

**Year view** = Teamup-style months-as-rows grid, lane-packed bars, drag-move + edge-resize via `startBarDrag` → `onDragCommit`. **Week/Day** = `WeekDayView`: all-day band above an hour grid (07:00–20:00, 30-min snap); timed engagements draggable/resizable via `evDrag` → `onEngCommit`.

**Pseudo-blocks** merged into `blocks`: holidays `'h'+id`, engagements `'e'+id`; exempt from the scheme filter.

**Holidays**: `staffOnHoliday()` blocks a clashing trainer assignment. `snapWeekday` pushes course start→Mon / end→Fri.

**Engagements**: personal timed entries with members (`engagement_member`); visible if you own it or are a member (needs a staff record AND a linked login).

**Block panel (`BlockDrawer`)**: admins get a Staff-view / Edit-view chooser, then a 👁/✏️ toggle. `editing = isAdmin && mode === 'edit'` gates edit fields, trainer select, ↩ buttons, the waiting pool AND the drag targets.

Uses `listBookableCategories()` since 27 Aug — see [[sgas-staff-accreditations]]. Migrations all applied — see [[sgas-client-meeting-aug26]]. Build-verify by copying src to /tmp, symlinking node_modules, `npx vite build`. See [[sgas-ui-conventions]], [[sgas-deploy-flow]].

## New-look calendar — Week, Day, Year (28 Aug 2026)

`src/views/CalendarNext.jsx` now carries all four views.

- **One date drives everything.** `anchor` is the only date state; `month` is
  derived from it. A separate `month` state meant paging to July in Month and
  clicking Week threw you back to today.
- **`barDown` is grid-agnostic.** It reads its column width from
  `el.closest('[data-cols]')`, so month rows (`data-cols=7`), the week/day
  all-day band (`data-cols=days.length`) and year rows (`data-cols=31`) all
  share one handler.
- **The drag writes to `preview` state, never to inline styles.** Nudging
  `width`/`transform` cannot reflow a bar onto another week row, so a two-row
  course could not be shrunk back. `shown` = `blocks` with `preview` applied,
  and the whole grid lays out from `shown`.
- **`justDragged` ref (250ms)** swallows the click a pointer drag produces —
  otherwise finishing a resize opened the course.
- **Year rows are all on a 31-day scale**, short months hatched (`.cx-ydead`),
  so dates line up down a column and match the `.cx-yhead` ruler. Bars are never
  padded to fit a label; short ones are labelled beside the bar (`.cx-yout`),
  clipped to the gap before the next bar in that lane.
- **The hour grid is opt-in.** Every course is all-day, so `DaysGrid` collapses
  `.cx-time` to a one-line toggle whenever nothing in range has a time on it.
- **Day view is a roster** (`.cx-roster`), not a second copy of the all-day
  strip: course, trainer, and every delegate with their kind.
- **`data-bid` on every bar** so runtime tests can follow one course across a
  reflow.

### Verification
`/tmp/sgastest` holds a copy of the app plus `bugs.mjs` — 30 Playwright
assertions against a production build. Rebuild there and rerun it after touching
this file. A passing `vite build` proves nothing; both of the bugs fixed here
built clean.
