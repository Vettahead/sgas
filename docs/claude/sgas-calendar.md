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
