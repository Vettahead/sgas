// Role model — single source of truth for who can see what.
// Roles agreed in the SGAS review meeting (see SGAS_roadmap.md §4.6):
//   ADMIN     — everything, plus the Admin screen; can view everyone's dashboard
//   STANDARD  — reception: dashboard, book a delegate, delegates, companies (no scheduling)
//   SCHEDULER — dashboard, book a delegate, schedule
//   ASSESSOR  — dashboard (their blocks to assess) + assessments
//   ACCOUNTS  — dashboard (outstanding to chase) + payments & chase
// Every role lands on a DASHBOARD tailored to what they do (§4.10 per-user dashboards).

export const ROLES = ['ADMIN', 'STANDARD', 'SCHEDULER', 'ASSESSOR', 'ACCOUNTS']

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  STANDARD: 'Standard',
  SCHEDULER: 'Scheduler',
  ASSESSOR: 'Assessor',
  ACCOUNTS: 'Accounts',
}

// 'calendar' — the ORIGINAL calendar — is GONE, not merely out of the menu:
// src/views/Calendar.jsx was deleted once nothing imported it any more.
// Everything it did lives in CalendarNext, including the two grids the
// Dashboard and the "Set up a course" wizard used to borrow from it — they are
// MiniMonth and MiniYear, exported from CalendarNext.jsx. It is in git history
// if it is ever wanted back.
//
// Views each role may open, listed in nav order. Used to build the sidebar AND
// to guard the active view (a hand-typed/stale view falls back to the default).
export const ROLE_VIEWS = {
  ADMIN: ['dash', 'inquiries', 'book', 'setup', 'sched', 'calendarnext', 'assess', 'pay', 'delegates', 'companies', 'courses', 'admin', 'roadmap', 'changelog', 'help'],
  STANDARD: ['dash', 'inquiries', 'book', 'calendarnext', 'delegates', 'companies', 'help'],
  SCHEDULER: ['dash', 'inquiries', 'book', 'setup', 'sched', 'calendarnext', 'help'],
  ASSESSOR: ['dash', 'assess', 'help'],
  ACCOUNTS: ['dash', 'pay', 'help'],
}

export function viewsForRole(role) {
  return ROLE_VIEWS[role] || ROLE_VIEWS.STANDARD
}

export function canAccess(role, view) {
  return viewsForRole(role).includes(view)
}

// The screen a role lands on at sign-in / refresh (first allowed view).
export function defaultView(role) {
  return viewsForRole(role)[0] || 'dash'
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Staff'
}


/* Who may CHANGE the schedule, as opposed to look at it.
   The calendar used to gate every write on `isAdmin`, which locked out the one
   role that exists to do this work: a scheduler could open the new calendar and
   change nothing on it, while the Schedule board let them do as they liked.
   Reception (STANDARD) keeps the calendar read-only — the role model above has
   said "no scheduling" since the review meeting. */
export function canSchedule(role) {
  return role === 'ADMIN' || role === 'SCHEDULER'
}
