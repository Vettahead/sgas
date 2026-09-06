// ─────────────────────────────────────────────────────────────────────────────
// TEAMUP — the API client, and the parser for twenty years of house shorthand.
//
// The API half is small: Teamup wants the API key in a Teamup-Token header and
// the calendar key in the path. The calendar key here is a READ-ONLY sharing
// link, so this code physically cannot alter anything at their end no matter
// what it is asked to do. There is deliberately no write verb in this file.
//
// The parser half is the interesting one. Titles are not free text so much as a
// private language, written fast by people who already know what they mean:
//
//   "EDINA Re T&A"              — customer, reassessment, training + assessment
//   "Clarke Energy x 6 + 2"     — customer, six delegates plus two
//   "OFTEC T&A 4 Spaces"        — scheme, training + assessment, four places left
//   "(6)DB-MLP Week 1 - Generic"— six delegates, Denis Brown, MLP week one
//   "KR INEOS"                  — Keith Rimmer, on site at INEOS
//   "SJ-Office AM +WFH PM"      — S Johnston, office morning, home afternoon
//
// Everything it works out is a SUGGESTION carried on the event for a person to
// confirm — the same rule as the Access import worklist, and for the same
// reason: a calendar that quietly invents a course is worse than one that
// stops and asks. Nothing here overwrites a title; the original is always kept.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://api.teamup.com'

export type Sub = { id: number; name: string; active?: boolean }
export type Ev = {
  id: string
  subcalendar_ids?: number[]
  title?: string
  start_dt?: string
  end_dt?: string
  all_day?: boolean
  who?: string
  location?: string
  notes?: string
}

async function get(calendarKey: string, apiKey: string, path: string) {
  const res = await fetch(`${API}/${calendarKey}${path}`, {
    headers: { 'Teamup-Token': apiKey },
  })
  const body = await res.text()
  if (!res.ok) {
    // Teamup echoes the address back in its errors; the key must not ride out.
    throw new Error(`Teamup ${res.status}: ${body.slice(0, 300).split(calendarKey).join('«key»')}`)
  }
  return JSON.parse(body)
}

export async function subcalendars(calendarKey: string, apiKey: string): Promise<Sub[]> {
  const d = await get(calendarKey, apiKey, '/subcalendars')
  return d.subcalendars ?? []
}

// Teamup wants a bounded window, so the years are asked for one at a time.
// Slower than one big call and far easier to reason about when a year is empty
// — and several of theirs are (2019, 2020, 2021 and 2023 hold nothing at all).
export async function eventsForYear(calendarKey: string, apiKey: string, year: number): Promise<Ev[]> {
  const d = await get(calendarKey, apiKey, `/events?startDate=${year}-01-01&endDate=${year}-12-31`)
  return d.events ?? []
}

// ── the parser ───────────────────────────────────────────────────────────────

// How many people. Three spellings, all real: "x 6", "4 Spaces", "(6)".
function places(t: string): number | null {
  const m1 = t.match(/\bx\s*(\d{1,2})\b/i)
  if (m1) {
    // "x 6 + 2" is eight people, written by somebody adding a late pair.
    const plus = t.slice(m1.index! + m1[0].length).match(/^\s*\+\s*(\d{1,2})\b/)
    return Number(m1[1]) + (plus ? Number(plus[1]) : 0)
  }
  const m2 = t.match(/\b(\d{1,2})\s*spaces?\b/i)
  if (m2) return Number(m2[1])
  const m3 = t.match(/^\s*\((\d{1,2})\)/)
  if (m3) return Number(m3[1])
  return null
}

// What kind of day it is. Ordered: the first match wins, and the order is the
// order of certainty, not the order they happen to appear in a title.
const KINDS: [RegExp, string][] = [
  [/\bhols?\b|\bholiday\b|\bbank holiday\b/i, 'holiday'],
  [/\bwfh\b/i, 'wfh'],
  [/\boffice\b/i, 'office'],
  [/\bt\s*[&+]\s*a\b/i, 'training_and_assessment'],
  [/\bwip\b/i, 'work_in_progress'],
  [/\bre-?\s?ass|\breassess|\bresit\b|\bre\s+t\s*[&+]\s*a\b/i, 'reassessment'],
  [/\bass(?:essment)?s?\b/i, 'assessment'],
  [/\btraining\b|\bprep\b/i, 'training'],
  [/\bexams?\b/i, 'exam'],
  [/\bmeeting\b|\bvisit\b/i, 'meeting'],
  [/\bon ?site\b|\bconsultancy\b/i, 'on_site'],
]
function kind(t: string): string | null {
  for (const [re, k] of KINDS) if (re.test(t)) return k
  return null
}

// Staff initials. Only ever matched as a standalone token — "SG" inside a word
// is a coincidence, and "KR-Gas Safety" must still find Keith. The caller
// supplies the map, built from the real staff list, so a new starter needs no
// code change.
function initials(t: string, known: Record<string, number>): number[] {
  const out = new Set<number>()
  for (const [ini, id] of Object.entries(known)) {
    if (new RegExp(`(^|[^A-Za-z])${ini}([^A-Za-z]|$)`).test(t)) out.add(id)
  }
  return [...out]
}

// Longest match wins, so "EDINA UK LTD" beats "EDINA". Matched
// case-insensitively on a word boundary — a customer name is a whole word in a
// title, never a fragment.
function longestNameIn(t: string, names: string[]): string | null {
  let best: string | null = null
  for (const n of names) {
    if (n.length < 3) continue
    if (best && n.length <= best.length) continue
    if (new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'i').test(t)) {
      best = n
    }
  }
  return best
}

export type Lookups = {
  staffByInitials: Record<string, number>
  courseNames: string[]
  categoryCodes: string[]
  employerNames: string[]
}

export function parseTitle(title: string | undefined, look: Lookups) {
  const t = (title || '').trim()
  if (!t) return {}
  const out: Record<string, unknown> = {}
  const p = places(t); if (p !== null) out.places = p
  const k = kind(t); if (k) out.kind = k
  const st = initials(t, look.staffByInitials); if (st.length) out.staff_ids = st
  const course = longestNameIn(t, look.courseNames); if (course) out.course = course
  const cat = longestNameIn(t, look.categoryCodes); if (cat) out.category_code = cat
  const emp = longestNameIn(t, look.employerNames); if (emp) out.employer = emp
  return out
}

// ── what a sub-calendar probably is ──────────────────────────────────────────
// Teamup keeps three different kinds of thing in one list of 25, and the app
// has a different table for each. This is only ever a suggestion; the Spare
// calendars in particular deliberately get NO suggestion, because they are
// named "spare" and are in daily use for something else entirely, which is
// exactly the case a person should look at rather than a computer decide.
export function proposeKind(name: string): string | null {
  const n = name.toLowerCase()
  if (/^spare/.test(n)) return null
  if (/hol|not available/.test(n)) return 'holiday'
  if (/meeting|maintenance|on ?site|consultancy/.test(n)) return 'engagement'
  if (/assessments?$|training$|^simon|wfh|short office/.test(n)) return 'staff'
  return 'course'
}
