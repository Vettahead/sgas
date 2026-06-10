export const todayISO = () => new Date().toISOString().slice(0, 10)

export function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function daysUntil(d) {
  if (!d) return null
  const ms = new Date(d + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')
  return Math.round(ms / 86400000)
}

export function addMonths(iso, months) {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export const initials = (forename, surname) =>
  ((forename || '?')[0] + (surname || '?')[0]).toUpperCase()

export const fullName = (c) => `${c.forename} ${c.surname}`

export const resultClass = (r) =>
  ({ PASS: 'pass', FAIL: 'fail', PENDING: 'pend', PARTIAL: 'part', NYC: 'nyc', NO_SHOW: 'noshow' }[r] || 'pend')

// Per-delegate attendance disposition (separate from the per-qualification result).
export const DISPOSITIONS = ['NYC', 'NO_SHOW']
export const dispLabel = (d) => ({ NYC: 'NYC', NO_SHOW: 'No-show', NONE: '' }[d] || '')
// What to show in a delegate's status badge: the disposition wins over the roll-up.
export const delegateStatus = (overall, disposition) =>
  disposition && disposition !== 'NONE' ? disposition : overall
