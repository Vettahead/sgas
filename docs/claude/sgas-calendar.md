---
name: sgas-calendar
description: "SGAS in-app Calendar feature (built 27 Jun 2026) — views, drag, holidays, engagements+members, admin-as-staff; replaces Teamup"
metadata: 
  node_type: memory
  type: project
  originSessionId: dc76eaa1-0c7c-4144-84b2-56e907073813
---

The SGAS Calendar is a full in-app deliverable built across the 27 Jun 2026 session. It REPLACES Teamup (see [[sgas-demo-backlog]] — Teamup item 9 is scratched). Central file: `src/views/Calendar.jsx` (large). Library: DayPilot Lite (`@daypilot/daypilot-lite-react`, Apache 2.0) — only `DayPilot` + `DayPilotMonth` are imported now (DayPilotCalendar / staff-lanes "Resources" view was REMOVED on Chris's request).

**Views** (VIEWS array): Month (DayPilotMonth, native drag-move/resize/create) · Week · Day · Year. Week/Day and Year are CUSTOM components, not DayPilot.

**Year view** = Teamup-style months-as-rows CSS grid (`YearView`/`YMonthRow`, 37 cols weekday-aligned, lane-packed continuous bars). Drag-move + edge-resize via `startBarDrag` (document mousemove listeners, smooth pixel-follow preview, commits whole-day delta via `onDragCommit`). Weekend "cut-out" dashed/faded overlays (`.yc-wknd-cut`); courses+holidays grey weekends, engagements don't. Rich `HoverCard` (branches per type: course roles/delegates, holiday staff+note, engagement title/time/people).

**Week/Day view** = `WeekDayView`: a top all-day BAND (single spanning lane-packed bars for multi-day courses/holidays, grows to fit, weekend cut-outs) ABOVE an hour time-grid (07:00–20:00, `HPX=44`, 30-min snap). Drag/click on the grid creates a TIMED engagement (opens CreateModal pre-filled, type ENGAGEMENT). Timed engagements render as positioned blocks, draggable (move time + cross-day in Week) and bottom-edge resizable via `evDrag` → `onEngCommit` → updateEngagement.

**Pseudo-blocks** merged into `blocks` so they render in every view: holidays `id 'h'+id` (isHoliday, grey), engagements `id 'e'+id` (isEngagement, slate, carries title/startTime/endTime/ownerUserId/members). `filtered` exempts them from scheme filter.

**Holidays**: per-staff time off. `staffOnHoliday(holidays,staffId,from,to)` blocks assigning that trainer to overlapping course (toast). Admin staff page shows holiday days taken (`weekdayDays`, Sat/Sun excluded). Can't book Sat/Sun start/finish — `snapWeekday` pushes course start→Mon / end→Fri.

**Engagements** = personal timed calendar entries ("Call with John" 9–12). Owner = creator (`owner_user_id`). MEMBERS: `engagement_member(engagement_id, staff_id)` join table — owner can add multiple staff via colour chips (CreateModal + EngagementDrawer). An engagement shows on a person's calendar if they own it OR are a member: `listEngagements(ownerUserId, ownerStaffId)` returns owner-OR-member rows + a `members[]` array (names). A member must have a staff record AND a login linked to it (`app_user.staff_id`) to see it. EngagementDrawer auto-saves title/date/time + member edits; only the owner can edit members.

**Admin / staff model**: every staff person = an `assessor` record + a login (`app_user`) with a role. `listStaff()` returns active assessor rows = the staff picker source everywhere. Admin → "Other accounts" has a **"Staff member" checkbox** (`makeStaff`: createStaff + updateUser staffId) so an admin-only login (e.g. Simon) ALSO becomes assignable staff while keeping their admin role. Staff-row Edit now includes an inline Role dropdown (saveEdit persists role; own role stays locked). `ROLES` includes ADMIN.

**Other fixes this session**: `color-scheme:light` on `html` + explicit `select` colours (fixes native dropdowns rendering black in OS dark mode). Dashboard has a mini-month module mirroring the calendar.

**API (`src/lib/api.js`)**: updateBlock/deleteBlock (drag persist); listHolidays/createHoliday/deleteHoliday/updateHoliday/staffOnHoliday/rangeDays/weekdayDays; listEngagements(userId,staffId)/createEngagement(+memberStaffIds)/updateEngagement(+memberStaffIds)/deleteEngagement. `pushBlockToTeamup` stub removed.

**Migrations Chris must run** (idempotent; in `Sgas project/` parent, NOT in repo): `sgas_user_staff_link.sql`, `sgas_assess_nyc.sql`, `sgas_holidays.sql`, `sgas_engagements.sql`, `sgas_engagement_members.sql`. Deploy = commit+push (Vercel auto), see [[sgas-deploy-flow]].

**Mount gotcha hit hard this session**: Edit-tool writes to api.js/Admin.jsx left the bash MOUNT truncated mid-file (lost tail functions → "not exported"). Fixed by restoring tails via bash python on the mount. Prefer bash-python edits for project files; always build-verify `npx vite build --outDir /tmp/sgasbuild --emptyOutDir` and check tail isn't truncated. See [[sgas-mount-write-gotcha]].
