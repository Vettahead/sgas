import { daysUntil } from './util.js'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT A DELEGATE CURRENTLY HOLDS.
//
// Roll a delegate's booking history up into their current accreditations: one
// row per qualification code, keeping the most recent PASS, cross-referenced
// against today to say what is due. Lived inside Delegates.jsx until Book a
// Delegate needed the same answer (Jen: "show me his qualifications and when
// they expire, so I can say your water is due in three months, do it the same
// week"). One rule, read in two places.
//
// Takes the `bookings` array from getDelegateHistory().
// ─────────────────────────────────────────────────────────────────────────────
export function renewalSummary(bookings) {
  const byCode = {}
  for (const b of bookings || []) {
    for (const x of b.categories) {
      if (x.result !== 'PASS') continue
      const prev = byCode[x.code]
      if (!prev || (x.achieved || '') > (prev.achieved || '')) {
        byCode[x.code] = { code: x.code, desc: x.desc, achieved: x.achieved, expiry: x.expiry, course: b.course, bcId: x.bcId ?? null }
      }
    }
  }
  return Object.values(byCode).map((r) => {
    const d = r.expiry ? daysUntil(r.expiry) : null
    let status = 'none'
    if (d != null) status = d < 0 ? 'expired' : d <= 90 ? 'soon' : 'active'
    return { ...r, days: d, status }
  }).sort((a, b) => {
    const order = { expired: 0, soon: 1, active: 2, none: 3 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return (a.expiry || '') < (b.expiry || '') ? -1 : 1
  })
}

// status → [badge class, label]. The same four the Delegates screen has always
// used; Simon has pointed at that card twice as the look he wants.
export const RENEWAL_BADGE = {
  active: ['pass', 'Active'],
  soon: ['due', 'Renew soon'],
  expired: ['fail', 'Expired'],
  none: ['scheme', 'No expiry'],
}
