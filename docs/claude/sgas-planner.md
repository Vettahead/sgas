---
name: sgas-planner
description: "SGAS Planner — the experimental calendar (one zooming timeline + rail). Design rationale, library research, what is still rough."
type: project
---

Built 27 Aug 2026. NEW `src/views/Planner.jsx` + a `.pl-*` CSS block. View key `planner`, nav item 🧪 "Planner" with a `beta` pill, in ADMIN + SCHEDULER `ROLE_VIEWS`. **The existing Calendar.jsx is untouched and stays the default** — a parallel experiment.

## THE CORE IDEA
**One timeline that zooms, not four views.** Days are columns of `pxDay` pixels; zooming just changes `pxDay`. Because the bars are the SAME DOM elements throughout, a CSS transition on `left/width/top` does the morphing — **that is where the animation comes from. No animation library.**

## THE OTHER BIG DECISION
**Everything works two ways: drag it, or tap it then tap the target.** Tap-to-place is not an afterthought — WCAG 2.2 SC 2.5.7 requires a non-drag alternative, and on a tablet it is faster and more discoverable.

## LIBRARY RESEARCH (done first — don't redo it)
- **Three.js/WebGL: ruled out.** No text primitive, canvas is opaque to screen readers, ~230 KB gzip. Right only for 50k+ bar Gantts.
- **DayPilot Lite (the current Calendar) does not support touch — PRO-only paid feature.** $1,449 to unlock, and it is ~100 KB gzip of the app's 468 KB. **That is why dragging never worked on a tablet.**
- Recommended but **NOT installed**: `@dnd-kit/react` 0.5.x (MIT, pointer events) + `motion` 13.x (ex-Framer Motion, MIT, `layoutId` morphing). Prototype was built with **zero new dependencies** — npm on the mount is fragile, the prototype needed to prove the design not the library, and plain Pointer Events already give the tablet support that was the main win.
- Schedule-X now paywalls drag AND resize; FullCalendar resource views still paid; react-big-calendar is MIT but has no year/timeline view; **Syncfusion Community Licence is free under $1M revenue / ≤10 employees — worth checking**; GSAP went fully free in Apr 2025.
- React `<ViewTransition>` is canary-only — do not build on it.

## IMPLEMENTATION NOTES
- **Window is BOUNDED**: today−92 → today+365 (stretched to the latest block within +730). Blocks run back to 2011; unbounded would be ~200,000px wide. `outsideCount` is reported in the toolbar rather than silently dropping them.
- **Weekends are a repeating-linear-gradient background, not one div per day.** Offset `(6-dow0+7)%7`, 2 shaded / 5 clear over 7 days. Unit-tested: 0 mismatches across 472 days.
- **Lane packing** greedy first-fit; unit-tested against the three overlapping June blocks.
- **Rail drag has a 5px threshold** so a tap stays a tap and only a real drag lifts a ghost.
- `groupBy: 'course' | 'trainer'`; attention list = upcoming blocks missing a trainer or delegates, or clashing with a holiday.
- API reused as-is — **no new API, no migration.** All drag is Pointer Events + `setPointerCapture` + `touch-action:none`. `prefers-reduced-motion` respected.

## STILL ROUGH / NOT DONE
No block creation on the timeline; no holidays/engagements rendered; no filters; no attendance editing or delete (panel links out to Schedule); keyboard drag not implemented (tap-to-place covers the WCAG requirement); many-trainer-row scrolling untested at volume.

See [[sgas-calendar]], [[sgas-ui-conventions]], [[sgas-client-meeting-aug26]], [[sgas-deploy-flow]].
