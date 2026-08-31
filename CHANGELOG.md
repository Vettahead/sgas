# Changelog

All notable changes to the SGAS Training Management frontend.
Newest first. The in-app Changelog screen (Settings → Changelog) shows the same
releases in plain English for the client; this file carries the technical detail.

## 2026-08-30 — dead CSS out, and `.top` renamed so it cannot bite again

Two jobs, one inventory. `scripts/class-audit.mjs` reads every class the JSX
composes — literals, and prefixes so `'tip tip-' + place` counts `tip-below` as
live — and diffs against `styles.css`. It reports three things:

- **COLLISION RISK** — a class composed at RUNTIME from a variable with no
  namespace. The exact shape of v1.32.3. Currently **0**.
- **GENERIC** — a prefix-less class with a BARE rule (`.x{...}`, not
  `.parent .x`) used in 2+ files. Four: `.b`, `.btn`, `.cgroup`, `.card` — all
  deliberate shared utilities, which is the opposite problem and fine.
- **DEAD** — defined but never composed.

**The audit found its own bug first.** The prefix rule only accepted
single-token literals, so `'tip tip-' + place` was missed and `tip-below`
appeared DEAD. A dead-code list you cannot trust is worse than none: it gets you
to delete something live. Fixed before anything was removed.

**`scripts/prune-dead-css.mjs`** — PostCSS, not a regex. The first attempt was a
hand-rolled brace walker that did not understand comments and produced a
stylesheet with balanced braces that still would not parse. Conservative:
families `cal|yc|wt|mv|wd|mc|rbc|cal2|att` only, a grouped selector loses only
its dead parts, and a rule goes only when EVERY class it targets is dead — so
`.cal-nav` and `.cal-nav-grp`, still used by the wizard toolbar, survive, and
`.cal-mini,…,.cal-nav{}` was trimmed rather than dropped.

185 rules removed. `styles.css` 128,830 → 114,049 bytes; built CSS 103.97 kB →
91.09 kB (gzip 19.89 → 17.71).

**Proof it changed nothing:** `cmp.mjs` loads the before and after builds side by
side, walks all fifteen screens and sums the rendered geometry of every element
carrying a class. Identical on all fifteen — 3,481 elements, same count, same
heights, same signature.

### `.top` → `.appbar`

The page header strip was `.top`: prefix-less, bare-ruled, `display:flex` with
28px of side padding. Any element anywhere carrying `top` inherited it — which
is precisely what happened to the course popover. Renamed (13 rules, one JSX
site); layout verified identical again.

`side.mjs`'s canary had to change with it: it asserted that the BARE class it
replaced still broke the panel, which stopped being true the moment `.top` no
longer existed — so it began passing for the wrong reason. It now applies a real
app-level class (`appbar`) and asserts THAT still breaks it, proving the
mechanism is live and that namespacing is what protects against it.

72 dead classes remain, mostly one-offs from earlier versions. Harmless, and
not worth the risk of a second pass tonight.

## 2026-08-30 — Calendar.jsx is deleted

`SetupWizard.jsx` was the last importer. Its date-picking step needed more than
the read-only grid the Dashboard got, so the pieces were generalised:

- `dragSelectDays(d, e, {onSel, onHint, onDone})` — lifted out of
  `CalendarNext`'s `cellDown`. The calendar finishes a drag by booking a course;
  the wizard finishes it by filling the dates in. Identical gesture, one
  implementation, including "a plain click picks nothing" (judged on whether the
  pointer MOVED, not on whether the dates differ — or a one-day course could
  never be dragged out).
- `MonthGlance` → **`MiniMonth`**, now optionally pickable: `selection`,
  `onPick`, controlled `month`/`onMonth`, and `nav` to suppress its own header
  when the host has one.
- **`MiniYear`** wraps the existing `YearGrid` with the same drag-select; its
  cells already carried `data-d`, so the shared helper works unchanged.

`SetupWizard`'s `anchor` is a plain `'YYYY-MM'` now rather than the old file's
date object, using the exported `shiftMonth`/`monthName`.

Then: `App.jsx`'s import and its unreachable `activeView === 'calendar'` route
removed, and **`src/views/Calendar.jsx` deleted** — 1,344 lines. Bundle
1,268.99 kB → 1,222.19 kB (gzip 417.04 → 403.19).

`.cal-*` CSS stays: `.cal-nav` and `.cal-nav-grp` are still used by the wizard's
toolbar, so a blanket sweep would break it. Dead-CSS pass is a separate job.

New `wizard.mjs`: 9 checks — the new grid is drawn and nothing of the old one
is, the title reads properly, the drag chip appears, dragging fills the dates,
picked days highlight, a plain click picks nothing, and Year both renders and
picks.

### The fault worth recording

Removing the old calendar's entry from `roles.js`, the comment above
`ROLE_VIEWS` and the object itself had no blank line between them, so a
comment-replacing edit took the object with it. `ROLE_VIEWS is not defined` —
the whole app blank on load.

**It then passed thirteen suites in a row.** The runner was
`node $s | grep -E '^(FAIL|ERROR)' || echo clean`: a script that threw before
printing anything produced no FAIL lines, so it was reported clean. Absence of
failure is not evidence of success.

`runall.sh` replaces it and demands the evidence: non-zero exit is CRASHED, any
FAIL/ERROR line is reported with the lines, and **zero PASS lines is itself a
failure** ("NO ASSERTIONS RAN"). 18 suites, 128 assertions, green under the new
runner.

## 2026-08-30 — add-a-qualification, and the Dashboard stops drawing the old calendar

**The last Schedule-only feature.** `AddQualRow` on the board became `AddQual`
in the course panel, opened by a fourth link on the delegate's row. Two rows
rather than the board's single cramped line — the catalogue is 110 entries and
the dropdown needs the width more than the buttons do. Scheme-filtered by
default with an "every scheme" override (4 → 109 in the demo data), Reassessment
preselected (the common case, per the review meeting), Add disabled until
something is picked, and a plain sentence when there is nothing left to add.
`addQualsToBooking` and `listBookableCategories` already existed; `listBlocks`
now feeds `cats` into the panel. Adding a NEW qualification to a REASSESS
booking correctly flips the delegate to `Mixed`, which the model already had.

**`MonthGlance`, and one month grid instead of two.** `Dashboard.jsx` imported
`MonthView` and `cal` from the old `Calendar.jsx` — so the retired screen was
still being drawn on the front page. The month grid's two pure pieces are now
module-level exports of `CalendarNext.jsx`:

- `monthGrid(month)` — Monday-first, five rows or six only when the month
  actually spills.
- `layOutMonth(list, grid)` — one segment per week for a course that crosses a
  boundary, then lane-packed per row so overlaps stack rather than hide.

The component uses them, and so does the new exported `MonthGlance` — the same
`.cx-` grid, bars, course colours and delegate-kind dots, read-only, every click
going to the real calendar. Plus `shiftMonth` and `monthName` so the Dashboard
no longer needs the old file's date helper at all. `.cx-glance` tightens
`--barh` and `--rowmin` for a card.

`Calendar.jsx` now has exactly one caller left: `SetupWizard.jsx`, for
`MonthView`/`YearView` in the date-picking step.

New `addqual.mjs`: 9 checks plus a read-only pass — the picker opens under that
person, is scheme-narrowed, offers both kinds with Reassessment first, widens on
"every scheme", refuses Add until something is chosen, actually lands on the
booking, closes itself, and Cancel changes nothing.

## 2026-08-30 — the course panel: wider, and a third off every delegate

Measured first. With three delegates at 1512x950: panel 376px wide, each
`.cx-delg li` **94px**, content 762 against 658 visible — 104px of scroll, and
the ACS row and Scheme row were below the fold.

Where the 94px went: `Delegate` stacked the name and the detail in a
`.cx-dinfo` column, so the three action buttons could not fit beside a two-line
block and `.cx-dacts` wrapped onto a third line of its own. Every delegate cost
a whole extra row. (That wrap was introduced in v1.32.0 to stop the name being
crushed into a 90px column — the right fix then, at 376px.)

- **`.cx-pop` 376px → 458px.** Most of the win: names, code lists and date
  ranges stop wrapping. `max-width:calc(100vw - 24px)` still protects narrow
  windows and the sheet still takes over under 720px.
- **`Delegate` restructured to two lines, always.** `.cx-dinfo` is gone; the
  name (`.cx-dname`) and `.cx-dacts` share line one, and `.cx-dsub` runs full
  width beneath with `flex:0 0 100%`. `.cx-kind` is `align-self:stretch` so the
  colour bar spans both.
- **`.cx-delg li` `gap:8px` → `gap:2px 8px`.** With `flex-wrap`, that 8px was
  also the ROW gap — 8px of dead space under every name, on every delegate.
- Paddings pulled in: `.cx-row2` 8px → 4px 8px, `.cx-rlabel.top` margin 5 → 2,
  `.cx-delg li` 9/10 → 6/9, `.cx-delg .cx-x` min-height 28 → 24,
  `.cx-resit-tag` 3/6 → 2/5.
- `max-height` `min(78vh,660px)` → `min(80vh,720px)`. The vh half is what
  protects a short window; the px half only bites on a tall one.
- "only some days" → "some days".

Result, three delegates: rows **94px → 57px**, and at 1512x950 and above the
panel does not scroll at all. 1508x780 (Chris's own window): 46px. 1280x720:
94px — down from what would have been well over 200.

New `panelfit.mjs` guards it across four viewports: every delegate row ≤60px
(the ceiling two lines buys) and the panel ≥440px wide. It closes the "Add
someone" chip grid before measuring, so it measures the panel as it sits when
you click a course rather than mid-task.

## 2026-08-30 — `booking.resat_from` / `resat_kind`: a re-sit stays a re-sit

Closes the gap left open in v1.33.0 an hour earlier.

MIGRATION `20260830174500_booking_records_the_resit_it_came_from.sql`, applied.
Two columns, answering two different questions:

- `resat_from bigint references booking(booking_id)` — the truthful link back to
  the sitting this one replaces. The audit answer to "which attempt was this".
  Partial index where not null.
- `resat_kind text check (in ('NYC','NO_SHOW'))` — the original disposition,
  copied at the moment of re-booking. Denormalised deliberately: it is a
  historical fact that can never change afterwards, and it means every screen
  colours a re-sit without a join back through a self-referencing FK on every
  listing of a course. The alternative was a PostgREST self-embed on the hot
  `listBlocks` query, which could not have been tested from the demo harness.

`rescheduleDelegate()` sets both, on the LIVE insert AND on the merge path (when
they were already on the target course, that booking is stamped too, guarded by
`.is('resat_from', null)` so a second merge cannot overwrite the first link),
and in demo.

`kindFromFlags(disposition, flags, resatKind)` gained a third argument: a re-sit
has no disposition of its own — it has not been assessed — so it takes the kind
of the sitting it replaces. `listBlocks` selects the two columns and exposes
`resit` and `resatFrom` on each delegate. Column grants checked: `authenticated`
holds table-level SELECT/INSERT/UPDATE on `booking`, so the new columns are
covered and `anon` still has nothing.

**In the UI.** The delegate row reads `NYC · Re-sitting` with the same tag pill
the rail uses, and its kind bar is the amber/red. `kindsOn()` therefore puts that
colour in the bar's stripe with no change at all — a mixed course draws amber
plus green. `barTip` counts a re-sit as "re-sitting" rather than as another "not
yet competent", because the colour already says which of the two it is:
*"2 booked · 1 new, 1 re-sitting"*.

`resit.mjs` grew four assertions and lost its NOTE block: the row reads as a
re-sit, its dot is `rgb(183,121,31)` or `rgb(192,57,43)`, it carries the same tag
as the rail, and the bar stripe holds that colour. Plus the thing Chris actually
asked about — a mixed course showing **one colour per kind**, asserted as
`["rgb(183, 121, 31)","rgb(31, 157, 85)"]` with the tip counting them
separately.

**Not backfilled.** Re-sits booked before today have no `resat_from`, so they
still read as ordinary bookings. Inferring them from `rescheduled` + client would
be a guess, and this is audit-facing.

## 2026-08-30 — the NYC / no-show reschedule pool on the calendar

Blocker 1 of 2 for retiring the Schedule board. `getReschedulePool()` and
`rescheduleDelegate()` already existed and were already correct; nothing in
`api.js` changed. What was missing was any entry point outside `Schedule.jsx`.

**Its own rail card, not merged into the waiting list.** Schedule merges the two.
Merged, a re-sit sorts wherever the alphabet puts it and drops below the six-row
cap — which is exactly how somebody already paid up and already promised a place
gets forgotten. A separate card also keeps its count visible when the rail is
folded.

**Colours reuse the existing vocabulary.** `KIND` already carried
`NYC: #b7791f` and `NO_SHOW: #c0392b`, the same amber and red `kindsOn()` puts
in a bar's stripe. The dot down the side stays the SCHEME colour so the rail
keeps one colour language and the legend under the chips stays true; the reason
rides as a `.cx-resit-tag` pill in the kind colour.

**One gesture, two calls.** `isResit(p)` tests the `rb-` id prefix from
`reschedEntry()`. A plain pool entry is `addDelegatesToBlock` (a new booking); a
re-sit is `rescheduleDelegate(bookingId, sessionId)`, which re-books the
ORIGINAL booking's non-PASS categories and flags the old one `rescheduled`.
Getting that fork wrong would charge somebody twice, so it is applied at all
four entry points: drag onto a course, drop onto empty days (booking a new
course for them), the chip list inside a course, and `creating.forPool`.

`dropVerdict` says which it is and what it costs them:
*"Hassan Iqbal re-sits Domestic Gas ACS Initial — the 3 they did not pass"*.

**Both lists can hold the same person, and both stay.** The pool is unplaced
bookings; the re-sit list is derived from assessed ones. A first pass deduped by
client+scheme — wrong: they are different bookings and hiding one loses a real
booking. Now both show and the pool entry is labelled *"also owed a re-sit"*,
with a tip spelling out that they are two different things. (In LIVE this
overlap should not normally arise: `loadPool()` reads bookings with no
`session_id`, and an assessed booking has one. It is the demo fixture that
overlaps, pool entry 101 and booking 3 both being client 3's three categories.)

New `resit.mjs`, 11 checks + a read-only pass. It books a course in the FUTURE
first, because every course in the demo seed has already run and the calendar
rightly refuses to change one that has — so this is end-to-end rather than a
drop onto a fixture. It asserts the tag colours are exactly `rgb(183,121,31)`
and `rgb(192,57,43)`, that the drag says "re-sit", that they leave the list,
land on the course, and carry only their remaining codes.

### Known gap, deliberately not papered over

Once placed, a re-sit reads as an ordinary delegate — `New` in green.
`rescheduleDelegate` creates a NEW booking and nothing on it records that it came
from an NYC; the history lives on the OLD booking (`disposition` + `rescheduled`).
So the kind dot and the bar stripe do not carry amber or red onto the course.
Fixing it properly needs a column (`booking.resat_from`), which is Chris's call,
not a silent schema change. `resit.mjs` PRINTS this rather than asserting it, so
it cannot quietly become untrue in either direction.

## 2026-08-30 (night, later) — FOUND IT: `.cx-pop` was inheriting `.top`

Not a paint bug. Not the placement maths. A **class-name collision**, proven
live on Chris's own machine.

`Popover.jsx` wrote its chosen side onto the panel as a BARE class name:

    className={'cx-pop' + ... + (pos ? ' ' + (pos.side || '') : '') + ...}

`side` is one of `bottom` / `top` / `left` / `right` / `centre`. And `.top` is
already a class in this stylesheet — line 33, the page header strip on every
screen:

    .top{background:var(--panel);border-bottom:1px solid var(--line);
         padding:14px 28px;display:flex;align-items:center;gap:16px}

So a panel that opened ABOVE its course became `display:flex` with
`align-items:center` and 28px of side padding: its header, date block, rows and
footer were laid out in a ROW, squeezed into columns, and overflowed
horizontally. `align-items:center` is why the header floats at mid-height in the
video. The caret takes the same class, so a 13px arrow got 28px of padding each
side and drew as a ~69px lozenge — which measured out of the video frame at
about 70px, before the cause was known.

Measured on the live site, one class removed by hand:

    before  cx-pop top cx-course-pop   display:flex   padding:14px 28px   sw 483 / cw 374
    after   cx-pop cx-course-pop       display:block  padding:0px         sw 374 / cw 374

**Fix:** the side class is namespaced — `cx-side-top` and friends, in
`Popover.jsx` for both the panel and the caret, and in the four `.cx-pop.*` and
four `.cx-pop-caret.*` rules.

**Why it survived everything.** `place()` only picks `top` when there is no room
BELOW the anchor and there is room above — a course low on the screen. The demo
seed data has four courses, all high in the month, so no headless run at any
viewport ever produced `side === 'top'`. Chris's live data has eight, two of them
in the last week of the grid.

New `side.mjs`. It sweeps six viewports, but the part that matters does not
depend on the data: with a panel open it applies each of the five side classes
in turn and asserts `display:block`, `padding:0px`, no overflow — and then
applies the BARE class it replaced and asserts that one still breaks
(`display:flex`, `padding:14px 28px`, 178px of overflow). A test that cannot
fail is a test that has stopped meaning anything.

**Second collision of this kind** — `.cx-ghost` (drag ghost vs. a popover button)
made a button unclickable in v1.28.1. Generic class names in a single global
stylesheet, nothing reporting the clash, and a fault that only appears in the one
state that triggers it.

### What v1.32.2 was, then

Wrong diagnosis, but the change stands: the panel is still moved with
`transform` rather than `left`/`top`, which is the right way to move a fixed,
scrolling, shadowed box on every scroll frame. The opacity-only entrance is
required by that and stays.

## 2026-08-30 (night) — the popover is translated, not positioned

Chris filmed it. Two frames out of the clip show the course popover with the
`.cx-when` date block absent, the title absent, the header rule only ~90px wide,
the rows stranded in a narrow right-hand column, and a horizontal scrollbar.

**It is not CSS.** A brace-aware scan of every rule that can match `.cx-pop`,
`.cx-rows`, `.cx-when`, `.cx-row2`, `.cx-rfill` and `.cx-rwrap`, in every media
query, finds `display` set on exactly six of them and `.cx-pop` on none — there
is no rule anywhere that could lay the panel's children out in a row. It also
does not reproduce: production and dev builds, 1846x1318 (his own window size),
1512x950, 1280x720, 900x760, 700x900; every bar in four months opened at 5%,
50% and 95% along; viewport oscillated across the 720/1000/500 breakpoints with
a panel open; 70-step smooth resize drags. `scrollWidth === clientWidth` every
time, no page error, no console error.

What is left is a **paint/compositing artefact**, which fits everything: torn
output with fragments stranded and blank areas between them, a refresh curing
it, the whole app going white on a window resize, and it happening on one
machine and not in headless Chromium.

The provocation is ours. `.cx-pop` is `position:fixed`, scrolls its own content,
carries a 48px shadow, and `place()` re-runs on every scroll frame and after
every render. It was moved by writing `left`/`top`, which re-lays-out and
re-rasters the whole box each time.

- `Popover.jsx` now applies `transform: translate3d(x, y, 0)` instead of
  `left`/`top`. Rounded to whole pixels. Placement maths is untouched —
  `place()` measures `offsetWidth`/`offsetHeight`, which transforms do not
  affect — so this changes only how the answer is applied.
- `.cx-pop` gets `left:0; top:0; will-change:transform`, so it has its own
  layer before the first move rather than because of it.
- `@keyframes cx-pop-in` is now opacity-only. It animated `transform`, which
  would fight the positioning transform, and animating transform on a fixed,
  scrolling, shadowed box is the same provocation again.

New `place.mjs`: opens every bar at 5/50/95% across five viewports and asserts
the panel is fully on screen with no horizontal overflow — 0px both, everywhere.
New `follow.mjs`: after a scroll the panel re-places, stays fully on screen, and
its caret still points at its course. acs (admin + reception), verify, e2e, tip,
parity, schedcal and touch all clean.

**Unproven.** If it recurs, the theory is wrong and the next suspect is
`Popover`'s `useLayoutEffect(() => { place() })` with no dependency array.

## 2026-08-30 (later still) — Schedule's Calendar tab is the new calendar

`Schedule.jsx` imported `CalendarView` from `Calendar.jsx` and rendered it as its
`cal` tab. Taking `calendar` out of `roles.js` and `NAV_GROUPS` in v1.31.0 removed
the menu entry but not this, so the old screen was still one click away with none
of what has been built since — holidays, diary entries, delete, assessor/verifier,
filters, tips, the weekend guard, ACS forms.

`CalendarTab` now renders `CalendarNext`. Write access comes from
`canSchedule(user.role)`, matching the Calendar screen, rather than the `isAdmin`
prop it was handed — so a SCHEDULER can now actually schedule from this tab too.
`user` is still forwarded (without it `listEngagements` shows every user's private
diary entries).

`Calendar.jsx` stays on disk: `Dashboard.jsx` and `SetupWizard.jsx` still import
`MonthView`, `YearView` and `cal` from it. Nothing renders the full `Calendar`
component any more.

New `schedcal.mjs`: 6 checks that the tab renders `.cx-*`, carries no `.cal-*`,
has the Day/Week/Month/Year toolbar, draws bars, and opens a course with the ACS
forms row on it.

### Open, not reproduced

Chris reports the course popover breaking its layout on the live site, and the app
going white when the desktop window is resized with a modal open. Not reproduced
here across production and dev builds at 1512/1828/412/915 wide, nor by oscillating
the viewport across the 720/1000/500 breakpoints with a popover open — no page
error, no console error, no overflow, `.cx-pop` computing to `display:block` at
376px throughout. A white screen on resize is an uncaught render error, so the
next step is the actual console message from his browser. The prime suspect is
`Popover.place()`: `useLayoutEffect(() => { place() })` runs after EVERY render
with no dependency array, and only the `commit()` equality guard stops it looping.

## 2026-08-30 (late) — ACS forms on the calendar, with a pre-flight check

The last of the audit blockers that lived only on the Schedule board, and the
October audit deliverable. `getFormData` / `getBlockFormData` / `downloadForm` /
`downloadCombined` / `downloadZip` were already generic; nothing about the PDF
generation changed. What was missing was an entry point outside `Schedule.jsx`.

**In the course popover.** A new `cx-row2` between the delegates and the scheme:
*Print all N* (one combined PDF) and *One file each* (a zip). Each delegate row
also carries a `form` button. `printForms(want, delegate)` is the single path —
`delegate` null means the whole block.

**It checks before it prints.** New in `acspdf.js`:

- `formGaps(d)` — the boxes an LCL application must carry: surname, first name,
  8-digit DOB, 9-character NI, address, town, postcode, at least one code.
  Deliberately scoped to *the form*, not to the delegate record, which is why a
  missing email is not on the list.
- `unticked` — codes with no entry in `CODE_POS`. This is the nasty one: the
  form printed looking complete with nothing ticked, and nothing anywhere
  reported it. `OFTEC101` is in the demo data and hits this today.
- `formFaults(delegates)` — everyone who would print unusable, and why.

A set with faults renders an amber panel naming who is short of what, with
*Print anyway* / *Cancel*. Nothing is ever blocked — on the day the form goes
out regardless — but it is now a deliberate press.

**Not behind `canWrite`.** Both calls are reads. Reception send the paperwork
and do not schedule; gating this on the right to edit the calendar would take
the forms off the people who post them. Verified as Admin, Scheduler and
Reception.

### Two faults fixed on the way

- **The delegate row.** A third action button squeezed `.cx-dinfo` to about
  90px and wrapped the name over two lines. The buttons now sit in a
  `.cx-dacts` group so all three wrap together, and `.cx-course-pop .cx-dinfo`
  gets `min-width:148px` — which is what makes the group wrap rather than the
  name.
- **`.cx-pop-foot` is `position:sticky`,** so the bottom of a scrolling popover
  sits underneath it with nothing left to scroll: *Print anyway* was
  unreachable. `.cx-rows.room-below` adds 58px of bottom padding while the
  warning is up, and the view scrolls the buttons clear by hand.
  `scrollIntoView` is no use here — it counts an element hidden behind a sticky
  footer as visible and does nothing, `block:'nearest'` and `scroll-margin`
  included. Both measured at 1512×950, 412×915 and 915×412.

### Housekeeping

- Removed a duplicate `canWrite` prop on `YearGrid` (vite had been warning).
- `parity.mjs` matched `/Assessor/` case-sensitively against `.cx-rlabel`, which
  CSS renders in capitals and `innerText` returns as rendered. The app was
  right. Third time this class of test bug has come up here.

New `acs.mjs` suite: 13 checks across three roles, asserting real PDFs with the
right page count, the delegates' surnames present via `pdftotext`, one zip entry
per delegate, and the warning stopping, cancelling and printing anyway.

## 2026-08-30 (evening) — the old Calendar is out of the menu

Nine of the ten blockers from this morning's audit, closed. `calendar` is gone
from every role in `roles.js` and from `NAV_GROUPS`; `calendarnext` is now
labelled simply **Calendar**.

**The file stays.** `Schedule.jsx:595` renders the `Calendar` component as its
own tab and `Dashboard.jsx` / `SetupWizard.jsx` import `MonthView`, `YearView`
and `cal` from it. Only the nav entry and the route are gone, and there is a
comment in `roles.js` saying how to put them back.

### Permissions — the one that mattered most

`CalendarNext` gated **every** write on `isAdmin`, so a SCHEDULER — the role
that exists to do this work — could open it and change nothing. New
`canSchedule(role)` in `roles.js` (ADMIN or SCHEDULER); the 36 uses of
`isAdmin` inside the view are now `canWrite`, fed from it. STANDARD (reception)
gains `calendarnext` read-only, which the role model has described as
"no scheduling" since the review meeting.

### Holidays and diary entries

Both become blocks in `load()`, exactly as the old calendar shaped them, so one
grid, one lane packer and one drag handler cover all three kinds — the
alternative, a parallel layer per kind, is what makes calendars unmaintainable.
The `isHoliday` / `isEngagement` branches already threaded through this file
were dead code waiting for this.

- **Create**: the "New course" popover became a three-way — Course / Time off /
  Diary entry — hidden when somebody was dragged onto the grid, which is
  unambiguously a booking. Anyone who cannot approve is *asking*, and can only
  ask for themselves; same rule as the old screen.
- **Open**: two new popovers. Time off shows note and status, offers
  Approve/Reject to an approver, and Remove. A diary entry edits its date, times
  and members inline.
- **Drag**: `finish()` routes to `updateHoliday` / `updateEngagement` /
  `updateBlock` by kind.

### Delete, assessor, verifier

`deleteBlock` was never imported — there was no way to remove a course at all.
Two-step confirm inside the popover rather than a browser `confirm()`; the
database still refuses when delegates are booked. Assessor and verifier get
their own rows, with the same on-holiday marking the trainer picker has.

### Filters

Scheme chips, trainer chips, hide-finished, courses-only, Clear, and a count of
what is hidden on the control itself. Persisted per device.
**A course with no trainer stays visible under a trainer filter** — hiding
exactly the courses that need staffing would be the wrong way round.

### The weekend guard

`snapWeekday()` ported. Applied on create, on typing the dates, and on the drag
commit. A course that would run only over a weekend is refused; one that lands
partly on a weekend moves itself off and says so. Time off and diary entries
keep their real dates — they are not courses.

### Inbound links

`Dashboard.jsx` ×3 and `SetupWizard.jsx` ×1 repointed to `calendarnext`. The
dashboard's own `'calendar'` CARD id is untouched — different thing.

### Verified across three roles

**Admin**: old calendar gone from the menu, exactly one Calendar, filters hide
and report and clear, a course can be removed, assessor and verifier present.
**Scheduler**: sees it, gets the drag handles, can change a trainer.
**Reception**: sees it, gets no drag handles and no New course button.

End to end, against the real UI: time off created → appears on the grid → opens
with its note and status → removed. Diary entry created with a member → appears
→ opens with its times → deleted. A course refused when dragged onto a weekend.
Desktop, tips, portrait-touch and landscape suites all re-run green.

### Still open — the Schedule board

Four blockers remain there, unchanged: schedulers' write path (now solved on the
calendar, so this is really about parity), the NYC/no-show reschedule pool, the
**ACS form printing** (the October audit deliverable), and adding a
qualification to an existing booking.

## 2026-08-30 (later still) — landscape on a phone, and an unreachable menu

Chris asked whether landscape would help visibility on the calendar. Measured
rather than guessed, and the answer was yes-but — with a blocking bug in the way.

### The measurement

At 412x915 portrait vs 915x412 landscape, both a real Android context:

```
                       portrait   landscape (before)   landscape (after)
column width               56px            123px               127px
chrome before the grid    193px            210px                93px
month fits on screen        yes    no, 251px off              yes
course names fully shown    3/4              4/4                4/4
```

So the win Chris was after is real — a 7-column grid is the one layout that
genuinely wants width, and 56px cannot hold a course name — **but rotating made
things worse until the height was spent on the calendar instead of on chrome.**
New `@media (max-height:500px) and (orientation:landscape)` block: header to a
single tight line, toolbar controls to 30px, key hidden, `--rowmin` 78→46,
`--numh` 20→18, `--barh` 22, one line per course.

Scoped to short AND landscape, so a tall phone in portrait and any ordinary
laptop are untouched.

### The bug it uncovered

**Sideways, half the menu was unreachable.** The drawer breakpoint was
`@media (max-width:760px)` — and a phone held sideways is **915px wide**, wider
than plenty of laptops. So it got the full desktop sidebar: 1097px of navigation
in a 412px viewport, `overflow-y: visible`, no scroll. Everything below about
412px — Calendar — new look, Assess, Payments, Delegates, Companies, Courses,
Admin, Progress, Changelog, Help — could not be reached at all.

Three separate faults, one cause:

1. `.side` never scrolled. Now `overflow-y:auto` with a hidden scrollbar — that
   alone fixes it at *any* viewport too short for the menu, not just phones.
2. The CSS breakpoint became `@media (max-width:760px), (max-height:500px)`.
3. **The JS and the CSS had drifted apart.** `App.jsx` decided the same question
   in three places with a bare `window.innerWidth <= 760` — the initial open
   state, the close-on-navigate, and the scrim dismiss. In landscape all three
   said "desktop", so once the drawer did open it covered the page and never
   closed. Replaced with one module-level `isDrawer()` that matches the media
   query exactly, with a comment on each saying to change them together.

### Verified

New landscape suite: menu starts closed, menu scrolls to the items below the
fold, choosing a screen closes it again, the whole month fits without scrolling,
**every course name fully readable**, no sideways scroll, tapping a course opens
it. Desktop, portrait-touch and tips suites all re-run unchanged.

## 2026-08-30 (later still) — hover tips, and two faults an audit turned up

### Tips

New `src/components/Tip.jsx`, mounted once in `App.jsx`. Anything anywhere opts
in with a `data-tip` attribute — no import, no wrapper, no per-screen plumbing;
newlines in the attribute become real lines.

Why not `title`? It waits about a second, cannot be styled, never appears on
keyboard focus, and on Windows draws a grey box belonging to no design system.
Every `title` on the calendar's toolbar and bars is replaced.

Three rules it follows, all learned elsewhere in this app:

- **Nothing is hover-only.** Every tip repeats something a click or tap also
  reveals. A tablet has no hover — that is the exact fault logged against the
  old calendar's hover card, and it is not repeated. `Tip.jsx` bails out
  entirely unless `(hover: hover) and (pointer: fine)`.
- **Keyboard works.** `focusin` shows it, Escape dismisses it.
- **It never sits on a drag.** `pointerdown` clears it, captured.

380ms delay, dropping to ~0 while another tip is already up, so crossing a row
of buttons doesn't flicker. Clamped 96px from each edge.

`barTip()` composes the course tip: name, span and length, trainer (or "has
left, needs a trainer"), who is booked and what for, and the reason it is not
ready.

### Two faults, found by auditing this screen against Schedule.jsx and Calendar.jsx

**A finished course accepted drops.** `dropVerdict` had no date check, so a
delegate could be dragged onto a course that ended last year and the record
would change. `Schedule.jsx:294,303` has always refused this. Now:
`if (block.end < todayISO()) return { ok:false, why: '… has already finished' }`.

**The rail's counts were honest and its lists were not.** `needsWork.slice(0,4)`,
`thisMonth.slice(0,7)`, `pool.slice(0,6)`, `staff.slice(0,8)` — the heading said
8 and the list showed 6, with no route to the rest. Each capped group now ends
in a **Show the other N** control.

### Verified

Headless: tip appears on hover, names the trainer and booking count, clears on
leave, appears on focus, Escape dismisses, no `title` attributes left on the
toolbar, the capped-list control appears and reveals the rest. Desktop and touch
suites both re-run unchanged.

### Also produced this session: a feature audit for hiding the old screens

Two read-only audits of `Calendar.jsx` and `Schedule.jsx` against
`CalendarNext.jsx`. Neither can be hidden yet — see the session summary. The
short version: the new calendar never loads holidays or engagements, cannot
delete a block, and is admin-only for writes while the SCHEDULER role exists to
do exactly this work.

## 2026-08-30 (later) — mobile, and a class-name collision that broke a button

### The bug: `.cx-ghost` defined twice, for two different things

`styles.css` line ~1276 styled `.cx-ghost` as a **ghost button** (border, radius,
muted text). Line ~1617 styled `.cx-ghost` as the **drag ghost** — the card that
follows the pointer while dragging someone onto a course:

```css
.cx-ghost{position:fixed;z-index:400;pointer-events:none;transform:translate(12px,10px); ...}
```

The second is later in the file, so it wins. Every ghost button in this view was
therefore `position:fixed; pointer-events:none; z-index:400`. Measured on the
"New course" popover before the fix:

```
position: fixed        pointerEvents: none      zIndex: 400
transform: matrix(1,0,0,1,12,10)
```

So "Full set-up instead" floated out of the footer, painted on top of the blue
primary button, and **could not be clicked at all**. Nothing reports a
class-name collision — the cascade just picks the last one.

The drag ghost is renamed `.cx-draghost` (one JSX use, plus `tests/dnd.mjs` and
`tests/bugs.mjs`, all updated). The button keeps the generic name, matching the
app-wide `.btn.ghost` convention. Verified after: `position: static`,
`pointerEvents: auto`, inside the footer, and `elementFromPoint` at its own
centre returns the button.

**Audited the rest of the `.cx-` block for the same shape of fault** — bare base
definitions of the same class appearing twice. Seven names matched; all seven
are deliberate additive rules on the same element (`cursor:cell`, an animation,
`position:relative`). `.cx-ghost` was the only genuine collision.

### Mobile

Chris was on an Android phone; the whole point of the redesign was that it works
there. Measured at 412×915 before: **333px of chrome before the first date**, a
third of the screen, with the toolbar wrapping to three stacked rows.

- Toolbar to two tight rows: title group and tools group each take a full row,
  controls at 34px, `+ New course` becomes a `＋` (the label is ~100px, which was
  the difference between two rows and three).
- The key toggle's label was wrapping to three lines in the corner; hidden below
  640px, since the `?` on every screen already explains the marks.
- `.top .sub` — the page's explanatory paragraph — hidden on phones. It is read
  once, not on every visit.
- `.top .right` no longer wraps mid-phrase ("Sign / out", "Sun, 30 Aug / 2026");
  it stays on one line and scrolls if it must.

Now **206px**, and the whole month fits above the fold.

### Course bars on a phone

The second line is hidden below 640px. A phone column is ~56px: the sub-line
truncated to `no trainer · 0 boo…` and, at the mobile `--barh` of 20px, two
lines of text spilled out of the bar and over the day numbers above it. One line
on a phone, both lines on a laptop; the detail is one tap away either way.
`--rowmin` 74→66, `--numh` 22→20, `--barh` 20→22.

### Verified on a touch context, not assumed

412×915, `isMobile`, `hasTouch`: toolbar fits two rows, the whole month is above
the fold, no sideways scroll, bars are one line, **tapping a course opens it**,
the page still scrolls under a finger, the side panel is reachable below the
calendar. Desktop re-run unchanged: drag, resize, trainer picker, Week/Day/Year,
holiday hatching, no runtime errors.

## 2026-08-30 — Calendar — new look: polish, and 52 dead CSS declarations

Run as a gauntlet against Amie (amie.so): build a piece, screenshot it, hand it
to a fresh critic with no context beside the real thing with the labels off, act
on the single gap it names, repeat. The app was built in demo mode and driven by
a headless Chromium so a round cost seconds rather than a deploy.

### The finding that mattered most

`src/styles.css` used `font: <weight> <size>/<line-height> inherit` in **52
places**. `inherit` is a CSS-wide keyword and cannot stand in as the family
inside the `font` shorthand, so the browser discards the whole declaration.
Measured, not guessed:

```
.cx-card h3   asked for 500 11.5px   rendered 700 16.38px   (UA default h3)
.cx-dow div   asked for 600 11px     rendered 400 14px
.cx-num       asked for 600 12.5px   rendered 400 14px
.cx-hintline  asked for 500 11.5px   rendered 400 14px
```

So most of the typography on this screen had never applied — headings 43%
oversized and two weights heavy, day numbers wrong, the weekday row wrong.
Rewritten as longhands (`font-weight` / `font-size` / `line-height`), which is
what should have been there: the family inherits on its own. **Nothing reports
this** — not the build, not the linter. Only reading a computed style does.
`font:inherit` alone is valid and was left as-is; the 18 uses of that are fine.

### The course bar

`.cx-mix` drew one 3px segment per delegate across the full width of a bar. On a
one-delegate course that is a solid line indistinguishable from a border — which
is what the "dots on a course" legend existed to explain. Replaced with actual
dots: one per **distinct** reason, capped at four, so a mixed course reads at a
glance and an ordinary one stays quiet.

The bar is now an object rather than an outlined field: no left cap, a committed
34% tint, 10px radius, and two type steps inside it — course name at 13px/500 in
a darkened version of its own hue, then trainer and booked count at 11px/62%.
The count badge (a solid pill of course colour with white text — the heaviest
mark on the bar for the least important number) is gone; the second line says it
in words. `--barh` 24→38, `--rowmin` 94→78, so rows hug their content.

### The side panel

Card chrome removed entirely — no borders, shadows, capitals, or badge around
each count. Groups are separated by space; headings sit *lighter* than the items
under them, which is the hierarchy a side panel needs and the inverse of what it
had. Colour survives only as a 6px course dot and the warning triangle the grid
already uses. The amber-filled "Needs attention" panel is gone: two rows should
not be the loudest object on the screen.

Dates shortened for a 300px column — `span()` gives `6–10 Jul`, not
`06 Jul 2026 – 10 Jul 2026`, so the second line never wraps and doubles a row.

### Chrome

The two permanent legend rows (~90px on every laptop) are behind a *What the
marks mean* toggle in the toolbar. Comfortable/Compact was a second segmented
control identical in appearance to Day/Week/Month/Year but on a different axis —
it is an icon toggle now, beside the other two preferences. Title 26→20px,
controls 36→32px, primary button unshadowed.

Grid rules dropped to ~3% (measured `rgb(247,248,250)` on white); weekends are
no longer filled grey — a weekend is not a disabled day, so the number is muted
instead. Applied to Week and Day's header band too.

### Bug found in dark mode

`button.cx-title` set no colour, and a `<button>` does not inherit one — so the
month title rendered as the UA's black on the dark background. Invisible, and
only findable by looking.

### Verified, not assumed

Headless run after the changes: bars render, grab and resize handles present,
**drag moves a course**, **resize changes its length**, clicking opens the panel
with its trainer picker, Week/Day/Year all render, the key toggle works, holiday
bars still hatch. No runtime errors.

### On the gauntlet itself

The rail won its round — two independent fresh critics picked it over Amie's
real side panel. The full grid did not; critics kept choosing Amie. But by the
last two rounds they were describing "a 1px stroke on every event bar" and
"full-strength column rules" that **provably do not exist** — the DOM shows
`border: 0px`, `box-shadow: none`, and the rules measure a 3% grey. Once a judge
is inventing its evidence it has stopped being a judge, so the loop was stopped
there rather than grinding rounds against confabulation. The bar was also not
like-for-like: Amie's `/calendar` is a chrome-free page with five photographic
cards, against a working month grid that must carry 35 days, spans, trainers,
warnings and drag targets.

## 2026-08-30 — Session tokens replace the self-signed JWT

Sign-in tokens were JWTs minted by `app_mint_token` and signed HS256 with this
project's **legacy JWT secret**. Supabase is retiring the legacy keys by the end
of 2026, and the natural last step of that migration — revoking the secret —
would have taken sign-in down for the whole company. `app_login` now also issues
a **session token**: 32 random bytes, returned once, stored only as a SHA-256
hash in `app_session`, sent by the browser as `x-sgas-session`. No signing secret
anywhere, so nothing left to retire.

**Both proofs are live at once.** The JWT still works; a browser on yesterday's
build is not locked out and nothing had to deploy in lockstep with the
migrations. `app_whoami().proof` reports which one a browser used, so the JWT
half can be dropped on evidence rather than on a guess.

### The decision worth recording: promote the request, don't reopen the tables

The straightforward implementation grants the eighteen tables back to `anon` and
lets RLS do the deciding — ordinary Supabase practice, and it would have undone
half of yesterday's lockdown. Two independent barriers exist today (`anon` holds
no GRANT, *and* the policies); that approach leaves one.

Instead a PostgREST `db-pre-request` hook (`public.app_pre_request`) runs inside
each request's transaction, resolves the token, and issues
`SET LOCAL ROLE authenticated` — permitted because the session user is
`authenticator`, a member of both roles. Grants stay revoked, the eighteen
policies are untouched, and only the means of proof changed.

**It fails closed.** No token, wrong token, expired, revoked, hook errors, hook
missing — all leave the request as `anon` with no grants, so screens go empty.
No failure mode of this design opens data up.

**The cost, stated plainly:** the hook is wired by a role setting rather than a
table, so a platform restore can drop it. `app_promotion_installed()` detects
that and the in-app connection check names it. Re-apply = re-run the last two
statements of `…123705_session_pre_request_promotion.sql`.

### Verified live over HTTP, not in the SQL editor

no header → 401 · valid token → rows · bogus token → 401 · the reporting view →
same both ways · `app_session` itself → 401 even signed in · legacy JWT with no
header → rows (nobody locked out) · revoked session → 401 on the next request.

### Revocation, finally used

`app_password_reset_complete`, `app_set_password` and `app_update_user`
(deactivation) now call `app_session_revoke_all`. Previously a changed password
or a disabled account left the person working for up to twelve hours, because a
JWT already issued could not be recalled. `app_delete_user` needed no change —
`app_session` cascades.

### One fault, caught and worth keeping

`app_role()` was written SECURITY INVOKER and reads `app_user`, which since the
lockdown is granted to nobody. It threw `permission denied for table app_user`
and took `app_whoami` down with it — the one screen people open when things look
broken. Found within minutes because `app_whoami` was curled on both paths after
the migration instead of being assumed to work.

**Rule:** after the lockdown, any new function reading a locked table must be
SECURITY DEFINER. Nothing warns you — not the migration, not the build. Only
calling it does.

### Frontend

- `src/lib/session.js` rewritten to hold both proofs, each with its own expiry.
- `src/lib/supabase.js` gains a custom `fetch` injecting the header from module
  state, read fresh per request so sign-in and sign-out take effect immediately.
  CORS checked first: Supabase echoes `x-sgas-session` in
  `access-control-allow-headers`.
- `appLogout()` ends the session server-side; never throws, because a sign-out
  that fails on a dropped connection would be worse than useless.
- Admin → Logins & access: connection check reports proof and promotion state; a
  new **Signed in now** card lists live sessions.

### Still to do

1. Watch `proof` for a few days, then drop the JWT half (`app_mint_token`,
   `app_jwt_secret`, the Vault entry, `app_tokens_enabled`, the README warning).
2. The app is already on a publishable key, so the anon-key half of the
   end-of-2026 deprecation is effectively done — confirm and close it.

## 2026-08-30 — The second password on Admin is gone

It only ever existed because there was nothing else to go on: every request
arrived as `anon`, so re-typing the admin password was the only way to prove who
was asking. The lockdown gave the request a signed token naming the user, so the
question can be answered properly.

**All fourteen admin RPCs funnel through `app_is_admin()`**, so one function was
the whole server-side change. It now says yes to either the request's token or
the old username+password — the latter kept because the Edge Function runs as
the service role and has no token of its own.

**The token path does not trust the claim.** It reads `app_user` by the user id
in the token, so a demoted or deactivated admin loses access on their next
click, not whenever their token expires. Tested: a non-admin whose token *claims*
`app_role: ADMIN` is refused.

Edge Function v10: door 2 now takes the caller's bearer token (verified in the
database via `app_token_is_admin` — signature, expiry, then a real user lookup)
and falls back to username+password. The anon key is itself a JWT and arrives
here signed-out; it verifies, but carries no `app_user_id`, so it fails on the
only thing that matters.

Net effect on security: stricter. The old box let anyone holding an admin
password in; the new check is tied to the signed-in account and re-read every
time.

## 2026-08-30 — The anon lockdown, applied

The largest risk on the project, closed. Every table carried `p_anon_all`
(ALL / anon / USING true) plus 137 grants to `anon`, and the anon key ships in
the JS bundle — so viewing source got you read/write on every delegate's name,
DOB, NI number and address.

### Why it took two halves

RLS alone was never going to do it. A policy cannot restrict a role that holds
an open GRANT, and a GRANT is not consulted at all once RLS denies — both had to
change together. 137 grants revoked, 18 policies replaced.

### The one that nearly got away

`v_live_qualification` — forename, surname, email, mobile, employer, expiries.
A view has no policies of its own, and without `security_invoker` it runs with
its OWNER's rights, reading straight past every policy on the tables beneath it.
Locking 18 tables and leaving that view would have been no lockdown at all.
Caught by listing what `anon` could still reach rather than trusting the
migration, and only because Chris asked to be walked through step 4 again.

### The trap underneath all of it

This project has already migrated to asymmetric JWT signing keys (its JWKS
endpoint serves ES256), while `app_mint_token` signs HS256 with the legacy
shared secret. Supabase honours the legacy secret only until the legacy key is
**revoked** — and the dashboard actively invites revoking it ("consider
switching to publishable and secret API keys to disable them"). Doing so takes
the whole app down. `app_whoami()` + the "Check this session" button in Admin
exist so this is measured from the browser rather than reasoned about; the SQL
editor carries no token and always looks healthy, which is the trap.

**The durable fix, not done:** drop the JWT for a session token in a request
header validated by the policies against an `app_session` table. No signing
secret, immune to Supabase key changes, and it gains sign-out-everywhere.

### Verified after applying, not assumed

| check | result |
|---|---|
| anon grants outside `app_setting` | 0 |
| tables still on `p_anon_all` | 0 |
| tables on `p_signed_in_all` | 18 |
| as anon: `select from client` | permission denied |
| as anon: `select from v_live_qualification` | permission denied |
| as a signed-in user | 10 delegates, 19 bookings, 35 sessions, 30 via view |

Applied by hand in the SQL editor, so `supabase_migrations.schema_migrations`
was back-filled — otherwise the next `db push` meets a schema the repo cannot
explain, and re-running would fail on the existing policies.

## 2026-08-29 — The June history, rebuilt from the commits

The in-app Changelog screen (`src/lib/version.js`) had 7 entries for the 104
commits up to 29 Jun, and 23 for the 38 after 27 Aug. June was reconstructed by
reading the diffs — the commit messages from that era ("dels", "block gap",
"cc") carry nothing.

**Three things the old entries got wrong, all found by reading the code rather
than the messages:**

- The calendar was written on **27 Jun**, not 28 — `src/views/Calendar.jsx`
  appears at build 54 and is reworked twice the same day. 1.4.0 (28 Jun) was
  claiming it. Now 1.2.2.
- "engagement system" is **personal diary entries** (`listEngagements` /
  `createEngagement`, title + date + time, owned by a user), not managed
  learning programmes. Nearly written up as the latter.
- "email chain and logs" is the **renewal chase log**
  (`recordRenewalContact` / `getRenewalContacts`), not an email feature.

**Build numbers rederived.** Every one was an estimate and most had drifted —
1.2.0 was labelled build 52, which is a 27 Jun commit. Also fixed at the
27/28 Aug boundary: 1.6.0 was on 105 (the 17 Jul docs import), 1.8.0 was dated
27 Aug for work committed on the 28th. All 32 now verified against
`git rev-list --count`, with a script in the commit message's session.

**0.1.0 is the one deliberate mismatch** and now carries a comment saying so:
the system went live 7 Jun, this repo starts 10 Jun ("update to git desktop"),
so build 1 is not a 7 Jun commit and never will be.

New entries: 1.2.1 (drag-and-drop board), 1.2.2 (the calendar), 1.3.1 (diary and
daily tasks), plus additions to 1.0.0 and 1.2.0.

## 2026-08-29 — The logo, and the only image there will ever be

`public/email-logo.png` (a copy of `src/assets/sgas-logo-white.png` — the
bundled asset gets a content hash, so it has no stable URL an inbox can fetch)
served from the site root and referenced absolutely by `LOGO` in `layout.ts`.
**Change that constant if the site ever moves to its own domain.**

The rule stays "nothing the email has to SAY may live in a picture". The logo
qualifies because it says nothing: `alt="SGAS"` is styled white/700/20px so a
blocked image renders as the wordmark the header carried before, and the
strapline is live text either way. No `height` attribute — reserving the image's
height left a hole above the strapline when it did not load. `tests/layout.mjs`
now asserts exactly one `<img>`, absolute src, and that alt text.

Verified both states by screenshotting with Playwright and `page.route()` —
once fulfilling the logo request from disk, once aborting it.

**Edge Function v9.** The logo only resolves once the site is deployed; until
then recipients see the alt-text header.

## 2026-08-29 — The emails get a layout

Plain-text emails were going out looking like a printout. Every send now carries
an HTML alternative as well, built by `supabase/functions/send-email/layout.ts`.

### The constraint that decided the design

The wording is edited by Chris in a textarea in Admin → Email → Wording. He must
never have to type a tag, and templates already in the database must keep
working untouched. So the templates stay plain text and `layout.ts` infers the
structure from the SHAPE of the text — the shape a person types anyway:

| what is typed | what it becomes |
|---|---|
| blank line | new paragraph |
| `  When:  Mon 14 Sep` (indented, `Label: value`) | a row in the details panel |
| paragraph OPENING in capitals | amber callout |
| a line that is only a URL | a button |
| `SGAS Training Management` on its own | dropped — the footer says it |

Two traps that cost a test each: a sentence containing a colon ("One thing:
bring ID") must not become a detail row, which is why the label regex demands
two spaces of indent; and the shout detector matches the OPENING of a paragraph,
not a whole line, because "PLEASE BRING PHOTOGRAPHIC ID. Without it we cannot
assess you." is mostly lowercase.

Detail blocks separated only by a blank line are merged into ONE table. Two
tables meant two label columns of different widths stacked on top of each other,
which looked like a bug. Caught by screenshotting the output, not by a test.

### Email HTML is not web HTML

600px, tables with `role="presentation"`, every style inline, web-safe font
stack, `color-scheme` meta plus a `prefers-color-scheme` block, a hidden
preheader, and **no images at all** — most clients block them by default and a
blocked image is a broken email. Outlook renders through the Word engine; Gmail
strips `<link>` and clips above 102KB (the largest template renders at ~6KB).

### Where it is wired

Inside `deliver()` in `index.ts`, so every path gets it for the price of one
line: `html: d.html ?? (d.text ? toHtml(d.text, subject) : undefined)`. A caller
that built its own HTML keeps it. The plain text is still sent exactly as typed
— it is what a text-only client, a screen reader and the Sent log show.

`tests/layout.mjs` — 10 groups, including escaping (`<script>` never reaches the
inbox as markup), the colon trap, and the Gmail clip threshold.
`scripts/preview-emails.mjs` writes four rendered samples to `/tmp/sgas-emails/`
for screenshotting; **look at them before shipping** — that is what caught the
double table and the over-bolded callout.

**Edge Function v8.** Deployed from the repo files, so the note below about the
deployed copy having trimmed comments is now closed: deployed and repo match.

## 2026-08-29 — The first emails that leave the building

Every email so far went to staff. Delegates now get four, from `bookings@`.

### The trigger, and why not the other one

A booking can exist before it has dates — reception takes it into the waiting
pool and it is scheduled later. So "you are booked" and "here are your dates"
are two different moments, and only the second is worth an email. "We have you
down, we will let you know when" generates the phone call it is meant to
prevent. `booking_confirmed` fires when a delegate is actually placed on a
course — from `addDelegatesToBlock` and `scheduleCourse`, not from the booking
screen.

The other three: `booking_moved` (the course they are on changes dates),
`booking_rescheduled` (they are moved onto a different one), `booking_cancelled`
(their place is released back to the waiting list).

### Two schema things that were waiting for this

`booking.confirmation_sent_at` has existed since the beginning and had never
been written to. It is now stamped **by the Edge Function after the send
succeeds**, not by the client when it fires — the column has to mean "they were
told", not "we meant to tell them".

`flag_photo_outstanding` explains why the confirmation says, in capitals, to
bring photographic ID. It is the cheapest possible place to ask, and a delegate
who arrives without it has wasted the day.

There is no start time anywhere in the schema, only dates. Rather than add a
column nobody would maintain, "arrive in good time" lives in the wording, which
is editable. The same trick covers the address.

### The employer copy

`company.send_to_employer` already routes the ACS form; it now also decides
whether the employer is copied. One send with a `cc`, not two sends — one email,
one log row, and the delegate is visibly the person being written to rather than
receiving a copy of something addressed to their boss.

### A second context function, on purpose

`app_notify_booking` rather than another branch in `app_notify_context`. A
cancelled booking has already had its session removed by the time the email is
composed, so this family — and only this family — needs a second id passed in.
Adding a fourth parameter to a function four other families share would spread
that awkwardness over all of them. Verified both ways: without the session id it
returns `no_session`; with it, the email can still name the course they came
off.

### Verified

Against a throwaway delegate, employer and course, since deleted: confirmed,
moved and rescheduled all sent from `bookings@` with the right subjects;
`confirmation_sent_at` stamped only after the send; a non-existent booking
returns `no_booking` cleanly.

### Note for whoever redeploys the Edge Function

The deployed copy of `send-email` carries the same code as the repo with some
comment blocks trimmed. **Deploy from the repo files** so the two converge
again.

### Files

`supabase/migrations/20260829220000_delegate_booking_emails.sql` (applied),
`supabase/functions/send-email/*` (deployed, v7 — `cc` support and the booking
branch), `src/lib/api.js` (`attachPoolItem` now returns its booking id;
notifications on schedule, move, reschedule and return-to-pool).

## 2026-08-29 — Employers on the worklist, and a list that answers itself

### Seven years, not six

Simon's answer moved to seven. 20,980 rows → 5,028; people → 3,266; staff
spellings 40 → 24; **employers 1,492 → 115**. Qualification columns barely move
(122 → 106), so that list is the same size whatever the cut. The employer number
is the whole argument for cutting at all: 1,492 free-text company names was
never a job anybody was going to do by hand, and 115 is an afternoon.

Employers are now seeded onto the worklist, sorted by how often they appear.
The rubbish is visible and easy to dispose of — three phone numbers, "ADDRESS AS
ABOVE", "SELF", "MOD PAYMENT", "INVOICED TO EAGA - SPLIT PAYMENT ETC." — and the
duplicates are exactly what you would expect: CENTRICA / CENTRICA BUSINESS
SOLUTIONS / "CENTRICA SEND CERT TO WORK", EDINA / EDINA UK LTD, READ & ERRINGTON
/ READ AND ERRINGTON / R+E / R&E.

### Three UI rules, and they are the point

Chris: *"if we have an exact match or close have the dropdown on it already so
we can just click confirm, cuts down on time"* and *"a new field to add our own
name to a new course (just in case it's changed)"*.

1. **The suggestion is already in the box.** The dropdown arrives set to the
   match. The job is to press Confirm, not to find the right line in a list of
   110 codes.
2. **Nothing saves until Confirm.** A pre-filled control that saved itself would
   be a guess with extra steps — which is the one thing this screen exists to
   prevent.
3. **Create takes OUR name, not theirs.** A text field beside the dropdown,
   pre-filled from the suggestion (title-cased for names, upper for codes). The
   Access spelling is a starting point, not the answer.

And one that falls out for free: **two rows created under the same name become
one thing**. That is how EDINA and EDINA UK LTD merge — no separate merge UI,
just type the same name twice.

### A bug caught in the design, not in use

`app_import_accept_proposals` set `decision = 'map'` for everything. For
employers that would have mapped 10 suggestions onto companies that do not
exist — we hold ten companies and the file has a hundred, so an employer
suggestion means "call it this", which is a *create*. The function is now
kind-aware.

### Files

`supabase/migrations/20260829200000_import_mapping.sql` (bulk-accept made
kind-aware), `src/views/ImportMapping.jsx` (rewritten around confirm-not-save),
`src/lib/version.js`, `src/views/Roadmap.jsx`.

### Parked

Sage was researched in full and parked at Chris's request — which API, which
endpoints, how paid should work, and the three questions for Jen. It is written
up in project memory as `sgas-sage`, including the finding that a **development
account with test data** exists, so the build is not blocked on Simon's live
Sage after all.

## 2026-08-29 — Reading the Access database, and a worklist for the bits a computer should not guess

### What is actually in the file

`NEW SGAS Database 060617.mdb`, read with mdbtools. Nine tables, but only one
that matters: **`BlankTable2`, 20,980 rows and 159 columns**, plus four tiny
lookups. No relationships. Three `ExportErrors` tables and an
`MSysCompactError` sit beside it, which is what a previous failed import leaves
behind.

Each row is one person's assessment record: their details repeated, then ~122
yes/no columns, one per qualification code. About 8,300 distinct people.

### Three findings that changed the plan

1. **There is no teaching history to backfill.** The plan assumed the file held
   who taught and who assessed. Assessor is filled on 60% of rows and Verifier
   on 59% — but **Trainer on 7%**, and most of those say the literal words
   "Assesment only". An assessment history is importable; a teaching calendar is
   not.
2. **Each row may hold two sittings**, not one: `Assessor`/`Assessor2`,
   `StDate2`/`EnDate2`, `Exdate2`. Unresolved.
3. **Three expiry columns** — `Expirydate` (12,336), `Exdate2` (8,417),
   `expiryfive` (2,970). Whichever we choose drives the renewal engine, so
   choosing wrong is worse than not importing at all. Waiting on Simon.

### The worklist

`import_mapping`: one row per distinct value in the file that a person has to
resolve, with Claude's suggestion beside it and a `decision` that only a human
writes. **Nothing is imported on a guess.**

Seeded with 162 rows: 122 qualification columns (59 match our codes exactly, 25
near-certain — `OFT201`→`OFTEC201`, `MET1K`→`MET1`, `HTRPL2`→`HTRLP2` — and 32
with no home, of which `cen1` alone is ticked 1,783 times), and 40 spellings of
about eleven staff names. "S GASDSDON" (4,972), "S GADSDON" (1,765),
"S GASDSON" (213) and "S G" (4) are all one man.

### The screen

Progress gained tabs; the second is Data import. **One control per row** — a
dropdown holding our list, "create this", and "ignore" — because three buttons
and a text box per row is more flexible and nobody would reach the end of 122 of
them. Picking saves immediately. "Accept every suggestion" fills in only the
undecided rows, so it can never overwrite an answer.

It is admin-gated with its own password confirm, like the Admin page: the RPCs
take admin credentials and the Progress page had no gate of its own.

### Six years

Simon's answer, mid-session. It cuts 20,980 rows to 4,484 — and more usefully
1,492 employers to **96**, which turns employer matching from impossible into a
morning. Staff spellings drop 40 → 23. Qualification columns barely move,
122 → 106, so that list stays as it is.

### Files

`supabase/migrations/20260829200000_import_mapping.sql` (applied; the 162 data
rows deliberately not in it — they are read out of a file that is not in this
repo), `src/views/ImportMapping.jsx` (new), `src/views/Roadmap.jsx` (tabs),
`src/App.jsx`, `src/lib/api.js`.

## 2026-08-29 (end of day) — Forgotten passwords, account emails, and a ? that works everywhere

### The reset, and what it deliberately does not do

`password_reset` stores **only the sha256 of the token**. The token itself
exists in exactly two places: the email, and the URL the person clicks. A stolen
backup is not a way in.

Four things worth keeping:

1. **The browser never sees the token.** The client asks the Edge Function to
   start a reset; the function gets the token from a `service_role`-only RPC,
   puts it in an email, and forgets it. There is no client-callable path that
   returns one.
2. **The link is not built from the caller's input.** `app_setting.app_url`
   supplies the base. A reset email whose link comes from whoever asked for it
   is a phishing kit with extra steps.
3. **The answer is identical either way.** Existing account, no account, rate
   limited, no email on file — all return `{ok:true}` and nothing else. The
   difference between "sent" and "no such account" is a list of who works here.
4. **Using a link kills every other outstanding one** for that account, so a
   chain of "I clicked it twice" resets cannot leave a spare key in an inbox.

Rate limit: one live request per account per five minutes.

### A real bug the test found

`app_password_reset_start` matched `username OR email` and took the lowest
`user_id`. **Chris's admin username IS an email address**, so a reset requested
for a test account's address resolved to his admin login and posted a live link
to it. Fixed by ordering an exact username match first; the stray link was
cancelled. Two accounts can answer to the same string, and the more specific
claim has to win.

### Account emails are not on the open door

`password_changed`, `user_created`, `account_disabled`, `account_enabled` are in
`ADMIN_ONLY_KINDS` and require admin credentials. Everything else through
`notify` is a statement about a *course*; these are statements about somebody's
*account*, and anyone holding the public key could otherwise tell a member of
staff their password had been changed.

### index.ts grew a deliver()

Four ways in now — internal secret, admin, notify, and the two reset actions —
and they all needed the same send-and-log. `deliver()` is that, once, so a new
path cannot accidentally skip the log or invent its own error handling.

### Help

The `?` in the top bar already existed and read from `Help.jsx`; what it lacked
was content for the screens added since June and a mapping for four of them.
Every screen in the nav is now mapped (checked in a script, not by eye), with
two new sections — Emails, and Holidays — and a rewritten Admin section covering
the tabs, leaving, and the difference between disabling and deleting a login.
"Getting started" now answers "I have forgotten my password" and "I got an email
saying my password changed and it was not me".

### Verified

- reset request for a real account, a fake one, and a second request inside the
  rate-limit window: all answer `{ok:true}`; only one email was sent
- complete with a rubbish token, an expired one, a short password, and the same
  token twice: each refused with the reason a person needs
- a good token: password changed, old password dead, all links for that account
  closed, one `password_changed` email logged
- an account email with no admin credentials: `Not authorized`
- 15 groups of wording tests, three time zones
- every screen in the nav has help content (script-checked)

### Files

`supabase/migrations/20260829180000_password_reset_and_account_emails.sql`
(applied), `supabase/functions/send-email/*` (deployed, v6),
`src/views/ResetPassword.jsx` (new), `src/views/Login.jsx`, `src/App.jsx`
(`?reset=` before the sign-in gate), `src/views/Admin.jsx`,
`src/views/Help.jsx`, `src/lib/api.js`, `tests/wording.mjs`.

## 2026-08-29 (later still) — Holiday requests, and one context function for every email

Time off used to be a row somebody typed in. It is now a request with a
decision on it, and three emails from `holidays@`.

### Approver, with a fallback

Chris picked "a named approver with admins as fallback", and the reason is on
the record: Simon is in Australia from 11 September, and a single named approver
would stall every request for a fortnight. So `app_setting`
(`holiday_approver_staff_id`) names the person, and `canApproveHolidays()`
returns true for them *or* any admin. Their own time off skips the queue —
`app_notify_context` returns `approver_is_the_requester` rather than emailing
somebody to approve themselves.

`app_setting` is a plain key/value table, readable by anyone (the calendar has
to know who approves before it can decide whether to ask) and writable only
through an admin-gated RPC.

### One context function, not three

The notify contract changed from `p_session_id` to **`p_ref`** — "the thing this
email is about". A session for the course emails, a holiday for the holiday
ones. One function, one door in the Edge Function, and the next kind of email
is a branch rather than a new mechanism.

The Edge Function still accepts `session_id` as well as `ref`, deliberately: the
function deploys instantly and the browser does not, so a tab running the
previous build would otherwise stop notifying until someone reloaded it.

### Placeholders became per-template

`email_template.tokens`. One global list was fine with one kind of email and is
wrong with two — `{{course}}` means nothing in a holiday email, and offering it
in the editor only invites somebody to write it. The Admin editor now lists what
*that* template can use.

Holiday is counted in **working days** (`extract(isodow) < 6` in the context,
`fmtWorkingDays` in the wording), because that is how the rest of the app counts
it. A course is still counted in calendar days. Same `{{days}}` placeholder,
different sums, and the help text says so.

### A rejection carries its reason

`decision_note` goes into the email as `{{reason}}`. A "no" with no reason is
the one that gets argued about a week later.

### Verified

- all three sent live from `holidays@` against a throwaway approver and
  requester, both deleted afterwards, with the right recipient each way round:
  request → approver, decision → the person who asked
- `approver_is_the_requester`, `no_holiday`, `no_email` all return cleanly
- `session_id` still routes correctly after the switch to `ref`
- 13 groups of wording tests, three time zones

### Files

`supabase/migrations/20260829160000_holiday_requests_and_settings.sql`
(applied), `supabase/functions/send-email/*` (deployed, v5), `src/lib/api.js`
(holiday requests, settings, `canApproveHolidays`), `src/views/Calendar.jsx`
(request instead of enter), `src/views/Dashboard.jsx` (the approver's card),
`src/views/Admin.jsx` (who approves), `src/views/EmailSettings.jsx`
(per-template placeholders), `tests/wording.mjs`.

## 2026-08-29 (later) — Admin in tabs, and what "delete a person" actually means

### The unlock bug, which cost a morning

`unlock()` did this:

```js
try { await load(auth); setAdminAuth(auth); setUnlocked(true) }
catch (ex) { setUnlockErr(...) }
```

and `load()` ends `catch (e) { toast(e.message) }`. It never rethrows. So the
catch in `unlock` was unreachable and **a wrong password unlocked the page** —
onto an Admin screen where every call then failed. Chris saw an empty staff list
and an Email card that said nothing but "Password incorrect", and reasonably
concluded the new email work had broken it. The logs said otherwise:
`app_list_users` and `app_smtp_get` both returned 400 "Not authorized" in the
same second, and `app_list_users` has not been touched in weeks.

Two lessons, both in the code now:

1. **A helper that swallows its own errors cannot be used as a check.** The
   unlock calls `listUsers` directly and stands or falls on that.
2. **"Password incorrect" was one message covering three different failures** —
   wrong password, an account that is not an admin, and the server being
   unreachable. It now says which.

### Removing a person

Chris asked for delete on staff and logins. They are not the same problem.

**A login** has nothing pointing at it, so `app_delete_user` really deletes it.
Guards: never the account you are signed in as, never the last active admin.
(The second is defensive rather than reachable — the caller must itself be an
active admin, so there are always at least two.)

**A staff record** cannot go. `session` and `booking` both reference `assessor`
with `NO ACTION`, and that is correct: the audit runs on who taught what. So
`assessor.left_on` marks the day they left. They disappear from `listStaff()` —
which is the single function every trainer/assessor/verifier picker in the app
reads, so one change removes them from all of them — and nothing they have
taught moves. "Show past staff" passes `{ includeLeft: true }`, and Reinstate
clears the date.

Chris's own framing, kept verbatim in the design: *"all legacy items they taught
and their file stay in place... if in the future, say they leave and there's a
course next week, it flags in the calendar that this now needs a trainer, it
doesn't lock on those ones."* So `block()` computes `trainerGone` — a trainer
who has left AND a course that has not finished — which feeds `ready`, the
dashboard's `missing` line, and the calendar's Needs attention. A course that
has already run keeps its trainer and stays `ready`. Verified all three cases
against a real row.

A record with **no** history is offered as a real delete, which is exactly the
four seed staff. The database is the thing enforcing that distinction, not a
checkbox in the UI.

### Tabs

Staff / Logins & access / Email. The staff table went from eight columns to six
by moving username, role and status to the accounts tab, which also gave the
non-staff accounts a home instead of a conditional block at the bottom of the
page. No new CSS — `.seg-tabs` and `.btn sm` / `.btn sm ghost`, the same pattern
the Schedule screen uses.

### Verified

- self-delete refused; a normal login deleted; a staff row with history refused
  by the foreign key (Simon intact, 9 staff and 35 sessions before and after)
- `left_on` filtering: 9 shown by default, 10 with past staff
- `trainerGone` against a real future session with a departed trainer: flagged;
  the same course dated in the past: untouched and still ready

### Files

`supabase/migrations/20260829140000_staff_left_and_delete_user.sql` (applied),
`src/lib/api.js` (`listStaff({includeLeft})`, `setStaffLeft`, `staffUsage`,
`deleteStaff`, `deleteUser`, `trainerGone` in `block()`),
`src/views/Admin.jsx` (rebuilt), `src/views/CalendarNext.jsx` (Needs attention).

## 2026-08-29 — Three notifications, and the wording moved out of the code

The plumbing built on the 28th could send but nothing used it. It does now.
`trainer_assigned`, `trainer_removed` and `course_moved` go out on their own,
and the words they use live in the database where Chris can change them.

### The problem worth writing down: nothing to authenticate with

Every email path so far takes admin credentials, because the Admin screen has
them to hand. A trainer notification does not. It fires when somebody drops a
name onto a course, that somebody may be a scheduler, and the browser does not
keep anyone's password — `app_login` checks it in the database and hands back a
sanitised row.

Three options were on the table:

1. **Hold the password in memory after login.** Rejected: a password kept
   around for the convenience of a feature is a password waiting to leak, and
   it dies on refresh anyway.
2. **A trigger or cron job inside the database.** The right long-term shape,
   and where the scheduled accreditation alerts will live — but it needs
   `pg_net` and `pg_cron` (neither installed) plus `SGAS_INTERNAL_SECRET`
   (not set, and only Chris can set it in the dashboard). All of that to ship
   one email.
3. **Narrow the door instead of widening the caller.** Taken.

The notify path accepts no address and no body. It accepts *"session 42 just
had a trainer put on it"*, and `app_notify_context` — `SECURITY DEFINER`,
`service_role` only — decides who is told, in what words, and whether the
notification is switched on at all. The worst an anon caller can do with it is
make a real trainer receive a true statement about a real course, at most once
per ten minutes. Measured against `p_anon_all`, which still lets the same key
read and write every delegate record in the system, that is not the risk worth
worrying about.

### Editable wording

New `email_template` table (RLS on, no policies, grants revoked from
`anon`/`authenticated`), seeded with the three. `app_email_templates` /
`app_email_template_save` are admin-gated exactly like `app_smtp_get`.
Placeholders are `{{like_this}}` and unknown ones are **left standing rather
than blanked**, so a typo shows up in the preview instead of silently emptying
a line.

The preview is rendered by the Edge Function itself, one step short of the mail
server, so it cannot drift from the email. It renders what is *stored*, not the
unsaved draft — save, then preview.

### Repeats

`app_email_recent` suppresses an identical kind + session + recipient +
**subject** inside ten minutes. Keying on the subject rather than a plain time
window is deliberate: the subject carries the dates, so a genuine second move —
to different dates — is a different subject and still goes out. A burst of
identical updates from dragging a bar about does not.

### Dates

`wording.ts` is split out of `index.ts` purely so it can be unit-tested with
`node --experimental-strip-types` (index.ts calls `Deno.serve` at import and
cannot be loaded outside Deno). Dates are parsed as UTC on purpose:
`new Date('2026-09-14')` is midnight UTC and printing it with `getDate()` in a
behind-UTC zone gives the 13th — the same trap `todayISO()` is still sitting in
elsewhere in the app. `tests/wording.mjs` runs in Los Angeles and Auckland to
prove it.

### Verified

- 10 groups of wording unit tests, in three time zones
- `app_notify_context` returns a clean reason for every skip: template off, no
  trainer, no email on the record, no such session, unknown kind
- over HTTP with the real anon key: the notification sends, an arbitrary send
  is still `Not authorized`, a preview is still `Not authorized`, and neither
  new RPC nor the template table is reachable
- three real emails sent and logged, against a throwaway trainer and course
  that were then deleted. No real staff were emailed.

### Files

`supabase/migrations/20260829090000_email_templates_and_notify.sql` (applied),
`supabase/functions/send-email/index.ts` + `wording.ts` (deployed, v3),
`src/lib/api.js` (`notifyEmail`, template calls, and the two write paths that
fire them), `src/views/EmailSettings.jsx` (tabs + the wording editor),
`tests/wording.mjs`.

## 2026-08-28 — The test send failed. Two faults, and what each one taught.

Chris entered all three passwords, pressed **Send test email**, and got:

> Edge Function returned a non-2xx status code

Nothing in `email_log`. That absence was the useful clue: the function logs
*every* attempt, delivered or not, so an empty log meant the failure happened
before the send — in the setup, not at the mail server.

### Fault 1 — the password could never have been read

The function fetched it with:

```js
db.schema('vault').from('decrypted_secrets')
```

PostgREST only serves the schemas it is configured to expose — `public` and
`graphql_public`. A request for the `vault` schema is refused before it reaches
the database. The password decrypts perfectly well in SQL (verified: all three
mailboxes, `decrypts = true`); the *route* to it was wrong.

This is a defect a passing build cannot catch, a passing type-check cannot
catch, and the anon-role security probes ran last session did not catch either —
they proved a browser *could not* reach the vault, and read that as success. The
same probe never asked whether the server could.

**Fix:** stop reaching across schemas from outside. `app_smtp_dispatch(p_key)`
is a `SECURITY DEFINER` function in `public` that returns host, port, secure,
address, username, from_name and the decrypted password in one call;
`app_email_log_write(...)` records the attempt. The Edge Function now touches
nothing but RPCs.

#### The grant that nearly shipped a password to the browser

`app_smtp_dispatch` returns a **plaintext password**, so it must be
service-role only. The migration said:

```sql
revoke all on function public.app_smtp_dispatch(text) from public;
grant execute on function public.app_smtp_dispatch(text) to service_role;
```

and that is **not enough**. Supabase's default privileges grant `EXECUTE` to
`anon` and `authenticated` *directly*, so those grants survive a revoke aimed at
`PUBLIC`. Checked rather than assumed:

```sql
select has_function_privilege('anon', p.oid, 'execute') ...
-- app_smtp_dispatch | anon: true
```

`anon` could have called it and been handed the SMTP password. Fixed with an
explicit `revoke ... from anon, authenticated`, re-checked (`anon: false`), and
confirmed over HTTP with the real anon key: `42501 permission denied for
function app_smtp_dispatch`.

The lesson worth keeping: **a `revoke ... from public` on a Supabase function
does not remove the client roles' access.** Always name them, and always verify
with `has_function_privilege` rather than trusting the statement ran.

### Fault 2 — the real reason was being thrown away

`supabase-js` turns every non-2xx from an Edge Function into the same sentence
and puts the actual response body on `error.context`. The function had described
its own failure precisely; `api.js` reported `error.message` and binned it.

**Fix:** `functionError()` reads the body off `error.context` before falling
back, and a single `sendMail()` wrapper now fronts every send so the flows added
next inherit this rather than each reinventing it.

Also hardened inside the function: an RPC that *errors* and an admin check that
*says no* are now different messages. “Not authorized” should mean the password
was wrong, not that the database was unreachable.

### What is proved, and what is not

A temporary probe function (since retired) opened a TLS socket from Supabase to
the mail server:

```
220 smtp2.lhr.stackcp.net ESMTP  — 465/TLS, 710ms
```

So the host is right, the port is right, and outbound SMTP is not blocked.
Verified as well: all three secrets decrypt, `app_smtp_dispatch('crm')` returns
a complete config, the function answers `401 {"ok":false,"error":"Not
authorized"}` cleanly without credentials, and neither new RPC is reachable with
the anon key.

**Not** proved: that the three passwords are correct. Only a real send can show
that, and it needs Chris's admin password — which is exactly the property the
design was built for. A failure now names itself.

## 2026-08-28 — Email plumbing, and an Admin screen to set it up

Chris has the SGAS mailbox details and asked for somewhere in Admin to enter
them, with the password box left blank once stored. That last instinct is right
and has a name — a write-only secret — and it is what the whole design is built
around.

### Where the passwords live
NOT in a column. They go into **Supabase Vault**, which encrypts them with a key
held outside the database. `smtp_mailbox` keeps only the secret's id. The only
component that ever decrypts one is the `send-email` Edge Function, using the
service-role key, and it scrubs the value out of any error it returns — SMTP
libraries have a habit of quoting failed credentials back at you.

Hashing was floated and would have been wrong: a hash is one-way, and an SMTP
password has to be *replayed* to the mail server on every send. Hash it and
nothing ever sends again.

### Why not an env var
The obvious answer, and better in isolation, but Chris wants to manage this from
Admin rather than a dashboard. Vault plus the RPC gate gets most of the way
there and keeps it editable.

### Locked down
`smtp_setting`, `smtp_mailbox` and `email_log` have RLS on with **no policies**,
and the table grants are **revoked** from `anon`/`authenticated` outright — two
independent locks, so a future "add a permissive policy" mistake still cannot
expose them. This matters more here than usual: every other table in this
database carries `p_anon_all` (ALL, `qual: true`), so the public anon key in the
JS bundle is effectively a full read/write key to everything else. Verified as
the anon role: SELECT, UPDATE and INSERT on all three tables are refused,
`vault.decrypted_secrets` is refused, and `app_smtp_get` with a wrong password
is rejected.

### The screen
`src/views/EmailSettings.jsx`, in Admin. Server and the three mailboxes come
pre-filled with SGAS's own settings, so the only thing anyone ever types is a
password. The password boxes start empty, **return to empty after a save**, and
nothing the server sends back can fill them — `app_smtp_get` returns
`password_set: true/false` and never the value. Empty therefore means "keep the
stored one"; `__CLEAR__` removes one. There is a test-send button that reports
what the mail server actually said, and a log of every attempt, because "did
Simon get the expiry warning?" has to be answerable.

Uses only existing classes (`.card`, `.body`, `.field`, `.fl`, `.inrow`,
`.twocol`, `.btn`, `.b`, `.tag`) — no new CSS.

### Verified
26 assertions at desktop and phone: the card renders, the server is pre-filled,
every box starts empty, a typed password saves, **the box is blank again
afterwards**, only that mailbox flips to "Stored", the count moves, and the
typed value appears nowhere in the page HTML, any input, localStorage or
sessionStorage. No console errors.

### Not done yet
The four actual emails — trainer-assigned, expiry alerts, renewal chase, booking
confirmation. This is the plumbing they all sit on.

## 2026-08-28 — The runtime tests live in the repo now

They had been in `/tmp` on the cloud container, which is discarded when a session
ends — so the most reusable thing built all day would have died with it.

`tests/` now holds all four suites (213 assertions) plus a README covering how to
rebuild the harness, and the two rules that make them worth having: assert on the
DATA changing rather than the gesture completing, and look at the screenshots —
four defects this session passed every assertion and were caught by eye.

## 2026-08-28 — Calendar (new look): nothing paints outside a course's own dates

Review: *"on the year view some text of courses is appearing outside the allotted
time?"* Correct, and it was a deliberate decision of mine that was wrong. An
earlier critic pass complained that short year bars were anonymous, so I added
`.cx-yout` — the name rendered at `left: calc(100% + 6px)`, outside the bar. On a
date-scaled row that is a lie: it says the course runs on days it does not.

### Fixed
- **`.cx-yout` is gone.** A year label lives inside its bar, clipped with an
  ellipsis. A bar under three days shows no text at all — the colour, the
  `title` tooltip and the rail carry it, and the bar's length stays honest.
- **The name is now the thing that shrinks.** A bare text node cannot take a
  `min-width`, so on a phone a long course name pushed the delegate-count `<em>`
  clean outside a Month bar. The name is wrapped in `.cx-bar-n`
  (`min-width:0; flex:0 1 auto; ellipsis`) and the badge, part-attendance mark
  and split-colour strip are `flex:0 0 auto`.
- **Handle clearance was applying to year bars.** `.cx-bar:has(.cx-grab)
  .cx-bar-t{padding-left:17px}` beat `.cx-ybar .cx-bar-t` on specificity, so a
  27px year bar carried 33px of padding for handles — that was the last 6px of
  overflow. Scoped to `:not(.cx-ybar)`.

### Added
- **`overflowcheck.mjs`** — a general guard, not a fix for one case: for every
  bar in every view at desktop, tablet and phone, no descendant may lay out more
  than 2px beyond the bar's own box. It found the two phone faults above, which
  had not been reported.

### Changed
- The old assertion "Year: every bar is named, however short" encoded the
  behaviour just rejected. Replaced with: no label reaches past its own bar,
  every bar names its course in a tooltip labelled or not, and bars wide enough
  still show a name.

## 2026-08-28 — Calendar (new look): the rail cards fold

Review: *"collapsable right hand items in the sidepanel i think as its too long
now."* Four cards ran off the bottom of the screen.

### Added
- **`RailCard`** — every card in the rail folds from its heading. State per card
  in `sgas_cx_cards`; Trainers starts folded, being the one you reach for least.
  Rail height 1014px → 273px with all four folded.
- **The count stays on a folded header.** Folding "Needs attention" away must
  never hide that there are courses without a trainer.
- **Spring-loaded.** Hovering the folded waiting list mid-drag opens it, and so
  does picking anybody up, so folding it away never costs you a drop target.
- Folding removes the contents rather than hiding them (`{open && …}`), so
  nothing inside a folded card is still tabbable.

### Fixed
- **Every rail card was the same height on a phone, folded or not.**
  `.cx-card{flex:1 1 260px}` was written for the ≤1000px row layout, but the
  ≤640px rule flips the rail back to `flex-direction:column`, where that
  flex-basis is a HEIGHT — so all four cards were 260px tall and shrunk to their
  own text width. `flex:0 0 auto;width:100%` in the column rule. Pre-existing;
  folding is what made it obvious.
- The ≤1000px row layout stretched every card to the tallest one in its line —
  `align-items` and `align-content: flex-start`, or folding a card saved nothing.

### Verified
26 assertions at desktop and phone sizes: every header is a real toggle with
`aria-expanded`, they all fold, the rail gets much shorter (1014→273 desktop,
994→273 phone), folded cards still show their counts and hold no rows, the state
survives a reload, and a folded waiting list springs open when you pick a
delegate up. The existing 101 + 68 still pass.

## 2026-08-28 — Calendar (new look): drag people onto the calendar

Review: *"the sidebar with waiting to be placed etc should be able to be dragged
onto the calendar (thoughts?) multiple ways to do things i always feel is best"*,
then *"needs to be doable on all things including touch. phone tablet the lot"*.

### Added
- **One drag layer, four drops.** `targetAt()` hit-tests with `elementFromPoint`,
  `dropVerdict()` decides what a drop would do, `performDrop()` does it. The
  highlight under the pointer and the action on release read the same function,
  so they can never disagree.
  - a waiting delegate onto a **course** → booked on it
  - a waiting delegate onto **empty days** → the booking panel opens on that day
    with their scheme's courses in a first `<optgroup>`, and they are added the
    moment it is booked
  - a **trainer** onto a course → assigned
  - a delegate **off** a course onto the waiting list → returned to the pool
- **A Trainers card in the rail**, showing how many courses each already has on.
- **A ghost that follows the pointer** naming the person and what the drop will
  do, coloured green / amber / red, with the target outlined to match. It warns
  before a scheme mismatch or a trainer who is on holiday that week.
- **Tap to pick up, tap to put down.** Dragging a person the length of a phone
  screen is a bad gesture however well it is built, so a tap arms "placing":
  every valid target lights up, a pinned bar says what you are holding, and a
  tap puts them there. Escape or Cancel puts them down. This is the phone route
  and it works on a desktop too.
- **Edge auto-scroll while dragging**, so the rail and the calendar do not have
  to be on screen together — on a phone the rail is a long way below the grid.

### Accessibility
Everything here is an accelerator. The course panel keeps "Add someone from the
waiting list", a trainer picker, and "take off" with a confirm, so there is a
non-drag route to all four — WCAG 2.2 SC 2.5.7. Pointer events throughout, with
`touch-action:none` on the handles; no HTML5 drag-and-drop, which is dead on
touch and still is on the Schedule board.

### Fixed along the way
- The popover sat above the rail and swallowed the drop when you dragged a
  delegate out of a course. `body.cx-dragging` now takes the panel, its caret
  and its scrim out of hit-testing.
- Auto-scroll fought the drop: a course within 90px of the top slid out from
  under the pointer as you reached it. It now holds still while you are over a
  valid target, except in the outer 40px, where it always scrolls so you are
  never stuck on something you were only passing over.
- Picking somebody up from inside the course panel closes it — on a phone it is
  a full-width sheet over the very list you then have to tap.
- The placing bar was `position:sticky` and scrolled away on a phone, which is
  exactly when it is needed. It is pinned.

### Verified
76 assertions across **desktop (1600×1000), tablet (820×1180) and phone
(390×844)**, plus 101 in the existing suite. Every drop is checked by the data
changing, not by the gesture completing: the waiting-list count, the delegate
appearing on the booked course, the trainer's course count. The phone run
exercises the real gesture — hold at the top edge and let the page scroll (1176
→ 600 during one drag). A click still does nothing but pick somebody up.

## 2026-08-28 — Calendar (new look): the popover came unstuck on scroll

Reported with a screenshot: with a course open, scrolling left the panel nailed
to the screen while the calendar moved away underneath it, and the page repainted
into a mess — content shoved sideways, the caret stranded mid-page.

### Fixed
- **The anchor was a frozen `DOMRect`.** `openAt` captured
  `getBoundingClientRect()` at click time and `place()` recomputed from that same
  stale rect forever, so scrolling could never move the panel. `at` is now
  `{ sel, fx }` — a CSS selector for the anchor plus how far along it you clicked
  — and the rect is measured fresh on every placement. Reproduced first: page
  scrolled 320px, panel stayed at y=160.
  - A selector also survives React replacing the node on a re-render, which a
    captured element reference would not.
  - `fx` is a fraction of the bar's width rather than a viewport x, so it stays
    correct through scrolls and resizes.
- **Scroll handling was unthrottled and re-rendered on every frame.** It is now
  one measurement per animation frame, and `commit()` skips the state update
  when nothing moved — that churn is the likeliest cause of the broken paint.
- **The sheet branch looped forever.** `commit()` compared `Math.round(undefined)`
  against itself; `NaN !== NaN`, so every pass committed a new object and
  re-rendered. It cost the phone sheet entirely. Comparison is now null-safe.
- **The caret read `panelRef.current.offsetHeight` during render**, a value from
  the previous layout. The measured `w`/`h` are carried in `pos` instead.

### Changed
- When the anchored course leaves — scrolled fully out of view, or removed
  because you paged to another month — the popover closes. A panel pointing at
  nothing is worse than no panel.
- Rail rows carry `data-bid` and anchor to themselves, not to the calendar bar
  for that course, which may not be in the month you are looking at.

### Verified
101 Playwright assertions. New: with a course open and the page scrolled 260px
the panel moves with it, the caret stays within 24px of the bar it points at
(0px before, 10px after), nothing overflows sideways, it stays on screen; and
paging to another month closes it along with its caret.

## 2026-08-28 — Calendar (new look): book a course from any view

Review: *"need to create in year view too."*

### Added
- **Drag across days to book a course in every grid.** `cellDown` was bound to
  `.cx-cell` in the month grid; it now looks for `[data-d]`, and the year rows
  (`.cx-ycell`) and the week/day all-day band (`.cx-band-cell`) carry `data-d`
  plus the same `onPointerDown`. One handler, four views.
  - In Year view a drag can cross a month boundary — the rows are months, the
    dates compare as ISO strings, so 30 Mar to 02 Apr books a four-day course
    spanning both rows.
- **A chip follows the pointer while you select**, saying how many days and
  which dates. The bar-drag chip rides the bar; a selection has no bar to ride,
  so this one tracks the cursor (`.cx-chip-len.float`).
- **The booking panel is the same `Popover`**, anchored to the last day you
  dragged over — the create flow no longer opens a centred modal while the
  course flow opens beside the bar. Its dates are editable before booking, so a
  drag that landed a day out is fixed in place rather than redone.

### Changed
- A drag now books, and a **click never does**, judged on whether the pointer
  moved rather than on whether the dates differ — the old test meant a one-day
  course could not be booked by dragging at all.
- Empty year rows have a 40px minimum height, so a month with nothing in it is
  still a comfortable drag target.
- `Modal` is no longer imported by `CalendarNext` — both panels are popovers.

### Verified
90 Playwright assertions. The new ones: in Year, Month and Week a drag across
three free days highlights them, shows the length, and opens a booking panel
pre-filled with those dates and a course picker; booking one in Year actually
adds a bar and opens the new course; a drag from March into April spans both
months; and a plain click books nothing.

## 2026-08-28 — Calendar (new look): a collapsible rail, and colour by scheme

Review: *"can we have the right bar collapsable/comes in when needed, and on the
modal \u2026 can we have the courses the attendees are doing on the selector part
colour coded with a line or something?"*

### Added
- **The rail collapses.** A toggle in the toolbar; `.cx-body.no-rail` drops to a
  single column and the calendar takes the space back (900 → 1218px at 1500
  wide). Persisted in `sgas_cx_rail`, defaulting to open at ≥1280px and closed
  below. While it is closed the button carries the "needs attention" count, so
  folding it away never hides an unstaffed course — that is the "comes in when
  needed" half.
- **`schemeColour(name)`** — the sixteen schemes we run are pinned to a colour;
  anything new hashes into the same palette so it is at least stable between
  visits.
- **The attendee selector is colour-coded.** Each person waiting carries a
  4px line in the colour of the scheme they are waiting for, plus the scheme
  name and how many qualifications. Anyone waiting for the same scheme as the
  open course is tinted, outlined and **sorted to the front**, with a line under
  the list saying how many. Delegate rows already on the course carry the same
  line, so the two lists read as one system.
- Somebody already on the course is dimmed and labelled — a person can hold a
  second booking so it is a warning, not a filter, but nothing here undoes an
  accidental double-add.
- The rail's "Waiting to be placed" rows use the scheme colour instead of a
  hardcoded green.

### Fixed
- `.cx-rail` sets `display:flex`, which beats the `[hidden]` attribute — the
  rail was dropping below the calendar instead of disappearing. Caught by
  screenshot, not by the assertion, which had only checked the attribute; the
  test now checks computed display and height.

### Verified
66 Playwright assertions. The new ones: the rail toggles, the calendar reclaims
the width, closed really means gone, the state survives a reload, the button
badges the attention count while closed; the selector renders a chip per person,
each names its scheme, the lines are distinct per scheme, and the ones that fit
the open course come first.

## 2026-08-28 — Calendar (new look): the Calendars-style popover

Review: Chris sent Calendars by Readdle — *"the popout/modal window looks super
clean and nice"* — and asked for the anchored popover, editing in place, the
side-by-side date blocks, the quiet icon rows, the duration chip on the bar,
round grab handles, the now-line time chip, and for the whole thing to feel
fluid.

### Added
- **`src/components/Popover.jsx`** — a popover anchored to what you clicked.
  Keeps everything `Modal` earned (Escape, focus trap, focus restored,
  confirm-before-discard while dirty) and adds placement that prefers
  below → above → beside, clamping inside the viewport, re-placing on scroll
  and resize, a caret that points back at the anchor wherever clamping pushed
  it, and a bottom sheet under 720px.
  - It anchors to **where you clicked on the bar**, not the bar's rect: a course
    can be most of a week wide, and anchoring to the whole thing pushed the
    panel across the grid and hid the course you were editing.
  - The caret renders **outside** the panel — the panel scrolls, and anything
    hanging off a scrolling box is clipped.
  - It focuses the panel, not its first control: a popover is something you
    read, and stealing focus into a `<select>` puts a loud ring on open.
- **Editing in place.** No edit mode and no Save button: the course, the dates,
  the trainer and the roster all commit on change, and the footer says so.
- **One date object** — starts, ends and the day count in a single bordered
  block, not two boxes and a detached pill.
- **Labelled rows** — Trainer / On this course / Scheme. An icon on its own is
  a guess.
- **The duration chip rides the bar** you are dragging instead of trailing the
  cursor, and the bar stops clipping it (`body.cx-dragging .cx-bar`).
- **Round handles** at each end on hover, and the bar title now starts clear of
  them.
- **The now-line carries the time**, at the left of today's column.

### Changed
- `listBlocks` returns `courseId`, so the popover can change which course a
  block is.
- "Needs a trainer or delegates" is a triangle, not an amber dot — it was
  indistinguishable from a course whose own colour is amber (OFTEC).
- "split" → "only some days"; "remove" → "take off", with a confirm and a
  28px-high target. It saves instantly and there is no undo.
- The waiting list is behind a disclosure; eight name chips permanently on show
  made the panel twice as tall as it needed to be.

### Verified
57 Playwright assertions against a production build: the popover anchors beside
the bar and never covers it, carries a caret, is fully on screen, flips at the
edge, closes on Escape and on an outside click, saves a trainer change without
closing, becomes a sheet with a scrim at 390px; the drag chip appears on the
bar, says the length, and goes on release without opening the course. No
console errors.

## 2026-08-28 — Calendar (new look): Week, Day and Year

Review: *"the resizer still doesn't work properly, it opens the event after
resizing; if it goes over a week you can't shrink it back to say 4 days over
multiple lines"* — plus *"let's move to the other views."* Both bugs are fixed
and verified end to end; Week, Day and Year are built and were then put through
an independent critic against Google Calendar, twice.

### Fixed
- **A drag ended by opening the course you had just dragged.** A pointer drag
  still fires a `click` on release. A `justDragged` ref, cleared after 250ms,
  now swallows that one click in all three grids.
- **A course that crossed a week boundary could not be shrunk back.** The drag
  was nudging inline `width`/`transform` on the element, which cannot reflow a
  bar onto a different row. The drag now writes to a `preview` state that the
  whole grid lays out from, so a two-row course collapses back to one row —
  verified by dragging one from 9 days to 4 across the boundary.

### Added
- **Week, Day and Year views**, with a Day/Week/Month/Year switcher whose
  choice persists. `barDown` reads its column width from the nearest
  `[data-cols]` track, so one drag handler serves all three grids.
- **One date drives every view.** `month` was separate state, so paging to July
  in Month and clicking Week threw you back to today. `month` is now derived
  from `anchor`.
- **Jump to a month** from the title — month grid plus year steppers.
- **A day scale on the Year view.** Every month row is drawn on the same
  31-day scale (short months hatched), so dates line up down a column. Bars are
  no longer padded out to fit their label; a course too short to hold its name
  is labelled alongside, clipped to the gap before the next bar.
- **The Day view is a roster** — course, trainer, and every delegate with what
  they are there for — not a second copy of the all-day strip above it.
- **The hour grid collapses when nothing is timed.** Every course here is an
  all-day, multi-day thing, so 07:00–20:00 was most of the screen saying
  nothing. One line offers it; it can be hidden again.
- **`data-bid` on every bar**, so runtime tests can follow one course across a
  reflow.

### Changed
- “Needs attention” is no longer scoped to the visible month — it hid unstaffed
  courses the moment you paged away from them.
- The right-hand rail lists the year, not "no courses this month", in Year view.
- The key above the calendar names its two groups: dots are why each person is
  there, the bar itself is the course colour.
- 07:00 no longer collides with the all-day divider.

### Verified
30 assertions in a headless Chromium run against a production build — all four
grids render, no dialog opens after any resize, a course stretches across a week
boundary and shrinks back to 4 days, view switching holds the date, the month
jump works, the Year scale is uniform and every bar is named. No console errors.

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
