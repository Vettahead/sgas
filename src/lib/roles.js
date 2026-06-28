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

// Views each role may open, listed in nav order. Used to build the sidebar AND
// to guard the active view (a hand-typed/stale view falls back to the default).
export const ROLE_VIEWS = {
  ADMIN: ['dash', 'inquiries', 'book', 'sched', 'calendar', 'assess', 'pay', 'delegates', 'companies', 'courses', 'admin', 'roadmap'],
  STANDARD: ['dash', 'inquiries', 'book', 'calendar', 'delegates', 'companies'],
  SCHEDULER: ['dash', 'inquiries', 'book', 'sched', 'calendar'],
  ASSESSOR: ['dash', 'assess'],
  ACCOUNTS: ['dash', 'pay'],
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
