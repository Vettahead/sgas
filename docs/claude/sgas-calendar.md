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

## The anchored course popover (28 Aug 2026)

`src/components/Popover.jsx`. Chris pointed at Calendars by Readdle; this is
that shape, not a centred modal.

- **Anchor to the click, not the element.** `openAt(b, e)` builds a 20px-wide
  rect around `e.clientX` spanning the bar's height. A course bar can be most
  of a week wide — anchoring to its rect pushed the panel across the grid and
  hid the course being edited.
- **Placement order is below → above → right → left**, then clamped to the
  viewport. The point is that the thing you opened stays visible.
- **The caret is a sibling of the panel, positioned in viewport coordinates.**
  The panel is `overflow:auto`, so a caret inside it gets clipped.
- **Focus the panel, not the first control.** A popover is read, not filled in;
  focusing a `<select>` puts a focus ring on it the moment it opens.
- **Under 720px it is a bottom sheet** with a scrim. The scrim is
  `rgba(6,11,20,.6)` because the app's nav drawer is nearly black and a lighter
  scrim did not visibly dim it.
- **No Save button anywhere.** Every control commits on change and the footer
  states it. If you add a control here, it must commit on change too.
- The app's shared `.cx select, .cx input` chrome gives every control a box, so
  the popover's title and rows explicitly opt out (`.cx .cx-pop select…`).

Colour: "needs a trainer or delegates" is a **triangle**, not an amber dot —
some courses are amber themselves and the two were indistinguishable.

## Scheme colour, and the rail (28 Aug 2026)

- **`schemeColour(name)`** in `CalendarNext.jsx` is the single source of a
  scheme's colour. The sixteen schemes we run are pinned in `SCHEME_C`; anything
  else hashes into `PALETTE` so it stays stable between visits. Use it anywhere
  a scheme is shown — the attendee selector, the waiting list and the delegate
  rows all share it, which is what makes them read as one system.
- **The rail is collapsible** (`sgas_cx_rail`, default open at ≥1280px). While
  it is closed the toolbar button carries the "needs attention" count, so
  folding it away can never hide an unstaffed course.
- Gotcha: `.cx-rail` sets `display:flex`, which beats the `[hidden]` attribute.
  `.cx-rail[hidden]{display:none}` is load-bearing — without it the rail drops
  below the calendar instead of disappearing, and an assertion that only checks
  the attribute will not catch it. Check computed display and height.

## Booking by dragging (28 Aug 2026)

`cellDown(d, e)` is the one handler for all four grids. Any grid that can be
dragged on marks its day cells with `data-d`; the move handler resolves the day
under the pointer with `elementFromPoint(...).closest('[data-d]')`. To make a
new grid bookable, give its day cells `data-d` and wire `onPointerDown`, then
pass `onCellDown` and `inSel` down to it — nothing else is needed.

- Year rows are months and dates compare as ISO strings, so a drag from 30 Mar
  down into 02 Apr books one four-day course across two rows.
- A drag books; a click never does. That is judged on whether the POINTER MOVED,
  not on whether the dates differ — the earlier `from !== to` test meant a
  one-day course could never be booked by dragging.
- The selection chip follows the pointer (`.cx-chip-len.float`) because a
  selection has no bar to ride. The bar-drag chip is the same class without
  `.float` and sits on the bar.
- Both panels are `Popover` now; `CalendarNext` no longer imports `Modal`.

## Popover anchoring — do not pass a rect (28 Aug 2026)

`Popover`'s `at` prop is `{ sel, fx }`, never a `DOMRect`. A rect captured on
click is frozen: the panel stays nailed to the screen while the page scrolls
away underneath it, which is exactly the bug reported on 28 Aug. The selector is
re-resolved and re-measured on every placement, which also survives React
replacing the node on a re-render. `fx` is the fraction along the anchor's width
that was clicked, so it stays right through scrolls and resizes.

- Placement runs on `scroll` (capture, so any scroller) and `resize`, throttled
  to one measurement per animation frame, and `commit()` skips the state update
  when nothing actually moved.
- `commit()`'s comparison must be null-safe. It once used `Math.round(undefined)`
  on both sides; `NaN !== NaN`, so the sheet branch committed a new object every
  pass and looped forever.
- The caret is positioned from the `w`/`h` carried in `pos`, not from a live
  `offsetHeight` read during render, which returns the previous layout's value.
- If the anchor cannot be resolved or is fully out of the viewport, the popover
  closes itself. Anything opening a popover must therefore anchor to something
  that is actually on screen.

## Dragging people onto the calendar (28 Aug 2026)

Three functions in `CalendarNext.jsx` carry the whole feature:

- `targetAt(x, y)` — what is under the pointer: `{type:'course',id}`,
  `{type:'day',d}` or `{type:'pool'}`.
- `dropVerdict(d, over)` — `{ok, warn, why}` or null. **The highlight and the
  action both read this**, so what lights up and what happens cannot diverge.
  Add a new drop by extending this and `performDrop`, nothing else.
- `performDrop(d, over)` — does it, confirming first when `warn`.

Two ways in, on every device:

- **Drag** — `dragStart(kind, item, label, colour, e)` on the source. 5px
  threshold so a click is still a click. Edge auto-scroll (90px band, always
  scrolls inside the outer 40px, otherwise holds while over a valid target).
- **Tap** — a pointerup with no movement arms `placing`. Every valid target gets
  its drop class, a pinned bar names what you are holding, and a tap on the
  calendar drops it. `placeAt` only swallows the tap when `dropVerdict` is
  truthy, so tapping another person switches to them instead of cancelling.

Gotchas that cost time:

- The popover is above the rail; without `body.cx-dragging .cx-pop{pointer-events:none}`
  (and its caret and scrim) a drag out of a course lands on the panel.
- Arming `placing` from a delegate row closes the popover — on a phone it is a
  sheet covering the list you have to tap next.
- The placing bar must be `position:fixed`, not sticky: you pick somebody up at
  the bottom of a phone page and scroll a long way to the calendar.
- Everything must keep a non-drag route in the popover (WCAG 2.2 SC 2.5.7).
  Pointer events only — HTML5 drag-and-drop is dead on touch.

`/tmp/sgastest/dnd.mjs` runs the whole thing at desktop, tablet and phone sizes
and asserts on the DATA changing, not on the gesture completing.
