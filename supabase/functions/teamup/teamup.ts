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
  // Lower-cased first names AND full names -> staff id, so "keith assessments"
  // and "keith rimmer assessments" both find the same man.
  staffByName: Record<string, number>
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
// Teamup keeps FOUR different kinds of thing in one list of 25, not three, and
// the fourth is the one they use most.
//
// "KEITH ASSESSMENTS" IS NOT KEITH'S DIARY. It is the courses Keith assessed —
// a course stream with a person permanently in a role on it. Chris said so, and
// the imported Access data agrees: of the 156 dates on that stream, 110 have an
// assessment record naming K Rimmer as assessor; of the 123 with any record at
// all, 89% are his. "Denis Assessments" (157 events) and "Phil Training" (48)
// are the same shape. The first version of this filed all three as personal
// diaries, which would have thrown away the assessor on 366 sessions.
//
// The word alone is not enough, either: "WRAS / HWSS / L8 - Full Training" ends
// in "Training" and belongs to nobody. So a person is only attached when the
// rest of the name actually matches a member of staff.
// The calendar says "Phil Training"; the staff list says Philip Rossall. People
// write the name they use, not the one on the contract, so an exact match is
// not enough. A shortening is accepted only when it is UNAMBIGUOUS — if two
// people could be "Chris", the abbreviation proves nothing and nobody is
// attached. Three characters minimum, because "S" is not a name.
function whoIs(word: string, staffByName: Record<string, number>): number | undefined {
  if (staffByName[word]) return staffByName[word]
  if (word.length < 3) return undefined
  const hits = new Set<number>()
  for (const [name, id] of Object.entries(staffByName)) {
    const first = name.split(' ')[0]
    // BOTH sides need real length. Staff records here include "A Calvert",
    // "D Nuttall" and "S Johnston" — a single-letter first name. Without this
    // check, "a" prefix-matched every stream starting with the letter A and
    // quietly proposed A Calvert as the owner of "Assessments", "ACOP 1-2-3"
    // and "Auditing Gas Work", and "d" claimed "Domestic" for D Nuttall. It
    // stayed invisible until the proposals were actually read on screen.
    if (first.length < 3) continue
    if (first.startsWith(word) || word.startsWith(first)) hits.add(id)
  }
  return hits.size === 1 ? [...hits][0] : undefined
}

export function proposeStream(name: string, staffByName: Record<string, number>) {
  const n = name.toLowerCase().trim()

  // Named "spare" and in daily use for something else — 263 events across three
  // of them. Exactly the case a person should look at rather than a computer
  // decide, so it deliberately gets no suggestion at all.
  if (/^spare/.test(n)) return {}

  if (/hol|not available/.test(n)) return { kind: 'holiday' }
  if (/meeting|maintenance|on ?site|consultancy|wfh|short office/.test(n)) return { kind: 'engagement' }

  // "<person> Assessments" / "<person> Training" — a course stream with an
  // owner. The trailing word says which slot they fill.
  const m = n.match(/^(.+?)\s+(assessments?|training)$/)
  if (m) {
    const id = whoIs(m[1].trim(), staffByName)
    if (id) return { kind: 'course', staff: id, role: m[2].startsWith('assess') ? 'assessor' : 'trainer' }
    // No such person: it is a course stream that happens to end in that word.
    return { kind: 'course' }
  }

  // A bare first name is a personal stream — though in practice these turn out
  // mixed, which is why the title parser gets the final say per event.
  const own = whoIs(n, staffByName)
  if (own) return { kind: 'staff', staff: own }

  return { kind: 'course' }
}

// ── the notes are where the real content is ─────────────────────────────────
// THIS IS THE CORRECTION THAT MATTERED. The first parser read only titles, and
// titles are the thin half: across 1,235 events they yielded a course on 26 and
// an employer on 32. Meanwhile 931 events carry NOTES, and the notes are a
// delegate list:
//
//   "Martin Smith COCN1,CGFE1, ICPN1 R + BMP1 I  Kieran McCormack Wk. 2 ..."
//   "Nick Pearn - COCN1, BMP1 & CGFE1 R  Lewis Stone - COCN1, BMP1 & CGFE1 R"
//
// Names, the qualifications each person took, and an R or an I against them —
// REASSESSMENT or INITIAL, per qualification, written down for two years. That
// is the one thing the Access file never recorded, and 390 notes carry an R,
// 347 an I. Reading titles for it found exactly one.
//
// Everything here is a SUGGESTION carried on the event. Notes are handwriting,
// not a form: no delegate is created from this and no qualification awarded.
export type NotedDelegate = { name: string; quals: string[]; kind?: 'reassessment' | 'initial' }

export function parseNotes(notes: string | undefined, codes: string[]): NotedDelegate[] {
  const text = String(notes || '')
    .replace(/<[^>]+>/g, ' ')          // Teamup stores notes as HTML
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
  if (!text) return []

  // A delegate starts at a Forename Surname pair. Anything between one name and
  // the next belongs to that person.
  const NAME = /\b([A-Z][a-z]+(?:'[A-Z]?[a-z]+)?)\s+([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?)\b/g
  const starts: { at: number; name: string }[] = []
  for (let m = NAME.exec(text); m; m = NAME.exec(text)) {
    starts.push({ at: m.index, name: `${m[1]} ${m[2]}` })
  }
  if (!starts.length) return []

  const byLength = [...codes].sort((a, b) => b.length - a.length)
  const out: NotedDelegate[] = []
  for (let i = 0; i < starts.length; i++) {
    const seg = text.slice(starts[i].at + starts[i].name.length,
                           i + 1 < starts.length ? starts[i + 1].at : undefined)
    const quals: string[] = []
    for (const c of byLength) {
      if (quals.some((q) => q.includes(c))) continue     // longest wins: CCLP1LAV before CCLP1
      if (new RegExp(`(^|[^A-Za-z0-9])${c}([^A-Za-z0-9]|$)`, 'i').test(seg)) quals.push(c)
    }
    // A standalone R or I after the qualifications. Only counted when the
    // segment actually names a qualification — a lone "I" in prose is a word.
    let kind: NotedDelegate['kind'] | undefined
    if (quals.length) {
      if (/(^|[^A-Za-z])R([^A-Za-z]|$)/.test(seg)) kind = 'reassessment'
      else if (/(^|[^A-Za-z])I([^A-Za-z]|$)/.test(seg)) kind = 'initial'
    }
    // ONLY where the note actually says what they took. Two capitalised words
    // is a weak signal on its own — "Express Certs", "Bank Holiday" and "Certs
    // on Server" all look like people. Requiring a qualification takes 3,988
    // name-shaped strings down to 1,738 real ones, and the ones dropped carried
    // nothing worth keeping anyway.
    if (quals.length) out.push({ name: starts[i].name, quals, kind })
  }
  return out
}
