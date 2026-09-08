// ─────────────────────────────────────────────────────────────────────────────
// HOW MANY ARE IN THE ROOM, DAY BY DAY.
//
// Until now SGAS had no seat limit at all — not on a course, not on a run, not
// on the centre. The only place that number has ever lived is the "(10)" Simon
// types into a Teamup title.
//
// And the headcount was never a single number to begin with. Take the
// Commercial week of 14 Sep 2026: nine people all week, Steve Comer on the
// Tuesday only, Darren Smith from the Wednesday. That is TEN in the room every
// day and ELEVEN people across the week. Counting bookings gives eleven and
// tells you the course is over full when it never was.
//
// So the count is per DAY, and the number to compare it against lives on the
// RUN, because the titles show it changes week to week.
//
// ⚠ A booking with no attendance window set is a FULL-WEEK booking, not an
// unknown. That is what null has always meant on `attend_from` / `attend_to`
// and what every screen already renders it as.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')

/** Every date the block covers, start and end inclusive. */
export function daysOf(start, end) {
  if (!start) return []
  const last = end && end >= start ? end : start
  const out = []
  for (let t = dnum(start); t <= dnum(last); t += DAY) out.push(iso(t))
  return out
}

/** The days one delegate is actually in. Null window = the whole block. */
export function daysFor(delegate, start, end) {
  const from = delegate?.attendFrom && delegate.attendFrom > start ? delegate.attendFrom : start
  const to = delegate?.attendTo && delegate.attendTo < end ? delegate.attendTo : end
  if (to < from) return []
  return daysOf(from, to)
}

/** True if this delegate is only in for part of the block. */
export const isPartWeek = (d) => !!(d?.attendFrom || d?.attendTo)

/**
 * The load on a block, day by day.
 *
 * Returns { days, peak, seats, over, anyOver, people } where
 *   days    – [{ day, n, over }] one per date the block covers
 *   peak    – the busiest day's headcount, i.e. how many seats it really needs
 *   seats   – the limit set on this run, or null if nobody has set one
 *   over    – how many the peak is over by (0 when under, or when no limit set)
 *   anyOver – true if any single day exceeds the limit
 *   people  – how many different delegates across the whole block
 *
 * `seats` being null means NO LIMIT SET. It never means zero — a run nobody has
 * put a number on must not read as full on every screen.
 */
export function dayLoad(block) {
  const start = block?.start
  const end = block?.end || block?.start
  const delegates = block?.delegates || []
  const seats = block?.seats != null && Number.isFinite(Number(block.seats)) ? Number(block.seats) : null

  const count = new Map()
  for (const d of daysOf(start, end)) count.set(d, 0)
  for (const d of delegates) {
    for (const day of daysFor(d, start, end)) {
      if (count.has(day)) count.set(day, count.get(day) + 1)
    }
  }

  const days = [...count.entries()].map(([day, n]) => ({
    day, n, over: seats != null && n > seats,
  }))
  const peak = days.reduce((m, d) => Math.max(m, d.n), 0)
  return {
    days,
    peak,
    seats,
    over: seats != null && peak > seats ? peak - seats : 0,
    anyOver: days.some((d) => d.over),
    people: delegates.length,
  }
}

/**
 * One line for the top of a course panel. Deliberately says two different
 * numbers when they differ, because "12 booked" and "10 in the room" are both
 * true and hiding either one is how the 14 Sep week read as over full.
 */
export function loadLabel(block) {
  const { peak, seats, people, over } = dayLoad(block)
  const room = (n) => `${n} seat${n === 1 ? '' : 's'}`
  if (!people) return seats != null ? `No one on it yet · ${room(seats)}` : 'No one on it yet'
  const head = peak === people
    ? `${people} on it`
    : `${people} across the week · ${peak} in on the busiest day`
  if (seats == null) return head
  return over > 0 ? `${head} · ${over} over ${room(seats)}` : `${head} · ${room(seats)}`
}
