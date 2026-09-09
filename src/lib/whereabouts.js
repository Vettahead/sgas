// ─────────────────────────────────────────────────────────────────────────────
// WHERE EVERYONE IS
//
// One list, used by every screen that asks the question, so a dropdown and an
// availability check can never disagree about what "on site" means.
//
// It exists because four of Teamup's sub-calendars are named "Spare" and three
// of them are in daily use — 263 events reading "Office", "SJ Hols",
// "SG Office / Bosch meeting" — alongside "Simon WFH or Short Office Day",
// "Meeting / Maintenance" and "On Site / Consultancy". 535 events in all, and
// every one of them answering the same question on a day nobody was teaching.
// Nothing was being done wrong: there was nowhere to put it.
//
// THE BLOCKING RULE (Chris, 6 Sep 2026): anything away from the centre stops
// somebody being put on a course. Working from home counts as away — being at
// your desk at home is not being in a classroom.
//
// THE ONE EXCEPTION, and it is the whole reason this is a table rather than a
// boolean: ON SITE AT A CUSTOMER still lets them ASSESS. They are out doing the
// work. What they cannot do is teach at the centre that day — so on site blocks
// the trainer slot and leaves the assessor slot open.
//
// HOLIDAYS ARE NOT IN THIS LIST. They have their own table and their own
// request-and-approve flow. Two ways to record time off would mean two answers
// to "is she in on Tuesday", which is worse than none.
// ─────────────────────────────────────────────────────────────────────────────

export const WHEREABOUTS = [
  { k: 'office',      label: 'In the office',        at: true,  blocks: false, assess: true,
    hint: 'At the centre and around — can be pulled onto a course.' },
  { k: 'wfh',         label: 'Working from home',    at: false, blocks: true,  assess: false,
    hint: 'Working, but not at the centre, so not available to teach.' },
  { k: 'on_site',     label: 'On site at a customer', at: false, blocks: true, assess: true,
    hint: 'Out doing the work — can still assess, cannot teach at the centre.' },
  { k: 'meeting',     label: 'In a meeting',         at: false, blocks: true,  assess: false,
    hint: 'Tied up for the day.' },
  { k: 'training',    label: 'Training or course prep', at: true, blocks: true, assess: false,
    hint: 'Their own qualifications, or setting a course up. At the centre but occupied.' },
  { k: 'sick',        label: 'Off sick',             at: false, blocks: true,  assess: false,
    hint: 'Unplanned — deliberately not the same record as booked time off.' },
  { k: 'unavailable', label: 'Not available',        at: false, blocks: true,  assess: false,
    hint: 'Blocked out, no reason given.' },
  { k: 'other',       label: 'Something else',       at: true,  blocks: false, assess: true,
    hint: 'Worth noting on the calendar, but it does not stop anything.' },
]

export const WHEREABOUTS_BY_KIND = Object.fromEntries(WHEREABOUTS.map((w) => [w.k, w]))

export const whereaboutsLabel = (kind) => (WHEREABOUTS_BY_KIND[kind] || WHEREABOUTS_BY_KIND.other).label

// Does this entry stop the person taking the given role that day?
// `role` is 'trainer' | 'assessor' | 'verifier'. Assessing is the one thing an
// on-site day still allows, so it is asked for by name rather than assumed.
export function blocksRole(kind, role) {
  const w = WHEREABOUTS_BY_KIND[kind] || WHEREABOUTS_BY_KIND.other
  if (!w.blocks) return false
  if (role !== 'trainer' && w.assess) return false
  return true
}

// The first whereabouts entry that stops this person taking `role` between two
// dates, or null. Returns the ENTRY, not a boolean, because every screen that
// asks wants to say WHY — "on site at INEOS" is an answer; "unavailable" is a
// shrug. A half day still counts: half a day away is not a day teaching.
export function staffAway(engagements, staffId, from, to, role = 'trainer') {
  if (!staffId || !from || !to) return null
  for (const e of engagements || []) {
    const mine = String(e.ownerStaffId ?? '') === String(staffId)
      || (e.members || []).some((m) => String(m.staffId) === String(staffId))
    if (!mine) continue
    const start = e.date, end = e.endDate || e.date
    if (!(start <= to && end >= from)) continue
    if (blocksRole(e.kind, role)) return e
  }
  return null
}

// "on site at a customer (INEOS)" — for putting next to a name in a list.
export function awayReason(entry) {
  if (!entry) return ''
  const label = whereaboutsLabel(entry.kind).toLowerCase()
  const half = entry.half === 'am' ? ', morning' : entry.half === 'pm' ? ', afternoon' : ''
  const what = (entry.title || '').trim()
  return what && what.toLowerCase() !== label ? `${label} (${what})${half}` : `${label}${half}`
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSISTING
//
// Helping to deliver somebody else's course, in the room, for part of its run.
// For availability it is TEACHING: you have to be at the centre to do it, so it
// asks the same question the trainer slot asks. On site at a customer still
// blocks it, even though on site leaves assessing open — you cannot help run a
// classroom from a plant in Grangemouth.
export function blocksAssist(kind) {
  return blocksRole(kind, 'trainer')
}

// Simon's rule, in code: EVERYBODY is on the assist list, except anyone already
// committed on those days — including on the very course being assisted, where
// the trainer and the assessor are already doing a job and cannot also be the
// help. Returns the first clash as { block, role } so the screen can say which
// course and in what capacity, or null.
//
// The current course is deliberately NOT skipped: that is the half of the rule
// that stops the trainer being added as their own assistant. An existing assist
// stretch on the same course is only a clash if the DAYS overlap — in on Monday
// and again on Thursday is a real thing people do.
export function assistClash(blocks, staffId, from, to) {
  if (!staffId || !from || !to) return null
  const id = String(staffId)
  for (const b of blocks || []) {
    if (b.isHoliday || b.isEngagement) continue
    if (!b.start || !b.end) continue
    if (!(b.start <= to && b.end >= from)) continue
    if (String(b.trainerId ?? '') === id) return { block: b, role: 'training' }
    if (String(b.assessorId ?? '') === id) return { block: b, role: 'assessing' }
    if (String(b.verifierId ?? '') === id) return { block: b, role: 'verifying' }
    for (const a of b.assists || []) {
      if (String(a.staffId) !== id) continue
      if (a.from <= to && a.to >= from) return { block: b, role: 'assisting' }
    }
    // Being ON an internal course is being taught, which occupies you just as
    // firmly as teaching does. A null date means the whole run.
    for (const a of b.attendees || []) {
      if (String(a.staffId) !== id) continue
      const f = a.attendFrom || b.start
      const t = a.attendTo || b.end
      if (f <= to && t >= from) return { block: b, role: 'being trained' }
    }
  }
  return null
}

// Which days of a course have somebody assisting — for drawing the checkered
// stretch on the bar. A Set of ISO dates, so the grid can ask day by day.
export function assistDays(block) {
  const out = new Set()
  for (const a of block?.assists || []) {
    for (let d = a.from; d <= a.to; d = new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)) {
      out.add(d)
    }
  }
  return out
}
