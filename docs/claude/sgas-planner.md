---
name: sgas-planner
description: "Planner — an experimental calendar built and REJECTED on 27 Aug 2026. Kept as a record of what was tried and why it did not land."
type: project
---

# REJECTED — do not rebuild this without asking

Built 27 Aug 2026 as an experimental tab, reviewed by Chris the same day, and **deleted**. `src/views/Planner.jsx` and its CSS are gone. This note exists so nobody proposes the same thing again.

## What it was
One horizontal timeline replacing the four Year/Month/Week/Day views. Days were columns of `pxDay` pixels and zooming just changed that number, so bars morphed smoothly between scales. A permanent right-hand rail held delegates waiting to be placed, courses needing attention, and staff. Everything worked two ways — drag, or tap-then-tap.

## Why it was rejected
Chris: *"yeah, dont like this."* No detailed critique — it simply did not feel like the answer. What he wanted instead, in his words: a calendar that is **"interactive, works on everything"**; the existing calendar **"works as it is but its clunky, like it was made with old tech"**; the side drawer that opens to add delegates and educators **"dosent work — maybe a nice modal?"**; and a third option: **a wizard**.

## What was learned, and what replaced it
The real problems were not the calendar's *shape*, they were:
1. **The Month view was a bought-in widget** (DayPilot Lite) that never matched the app and could not do touch on its free tier. That is what "made with old tech" meant. **Fixed** — rebuilt as `MonthView` in `Calendar.jsx`, dependency removed, bundle down 23%.
2. **The block panel was a cramped right-hand drawer behind a "view or edit?" question.** **Fixed** — now a centred modal, and the question is gone.
3. **Scheduling needed a route with no dragging at all.** **Fixed** — `SetupWizard.jsx`, "Set up a course".

**The lesson: when the user says a screen feels dated, look for the bought-in component and the extra click before redesigning the whole interaction model.** A parallel rebuild was the expensive way to find that out.

The library research behind it is still valid and worth keeping: see the 2026 comparison of dnd-kit / Motion / GSAP / scheduler licences summarised in [[sgas-ui-conventions]] and the session notes. Three.js remains ruled out for a text-heavy scheduler.
