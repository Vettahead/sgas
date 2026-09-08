import { useEffect, useMemo, useState } from 'react'
import { listTeamupMonth, listTeamupSubcalendars } from '../lib/api.js'
import { fmt } from '../lib/util.js'

// ─────────────────────────────────────────────────────────────────────────────
// THEIR CALENDAR, LAID OUT THE WAY THEIRS IS.
//
// Chris: "I need to flip to the Teamup as is, not an interpretation" — and then
// "that Teamup flip's awful, make it work like Teamup looks."
//
// The first go was a Gantt: one row per sub-calendar, bars across. That is a
// chart of their data, not their calendar. Teamup's month view is an ordinary
// month grid — Monday to Sunday, entries as coloured pills sitting on the days
// they run, coloured by which of their calendars they belong to. So that is
// what this is.
//
// EVERY entry is drawn as a positioned bar inside its week row, single-day ones
// included. That is how a month view actually works, and it is the only way a
// three-day entry can sit across three columns without being drawn three times.
//
// ⚠ THE COLOURS ARE OURS. Teamup colours by sub-calendar and we never captured
// their palette — only the names. So a stable colour is assigned per calendar
// and the key says plainly that the colours are ours. Everything else on screen
// is theirs, untouched.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const addDays = (s, n) => iso(dnum(s) + n * DAY)
const between = (a, b) => Math.round((dnum(b) - dnum(a)) / DAY)
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Enough hues to tell twenty-five calendars apart, assigned by a stable hash so
// "Hols / Not Available" is the same colour every time it is opened.
const HUES = [212, 152, 28, 276, 190, 336, 96, 16, 258, 172, 46, 300, 132, 4, 232]
function hueFor(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

/* Their notes are HTML they typed in Teamup and the formatting carries meaning:
   a numbered list is the candidate order, <del> is a cancellation. So it is
   kept. What goes is anything that could execute or load — this is text from
   another system being rendered into our page. Tags allow-listed, EVERY
   attribute dropped, and href is not on the list, so a link becomes plain text
   rather than something to click. */
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'del', 's', 'strike', 'br', 'p',
  'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre'])

export function safeNotes(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED.has(tag)) {
        if (tag === 'script' || tag === 'style' || tag === 'iframe') { child.remove(); continue }
        // Unwrapped, not deleted, so the words inside a stripped <a> survive.
        const parent = child.parentNode
        while (child.firstChild) parent.insertBefore(child.firstChild, child)
        child.remove()
        continue
      }
      for (const a of [...child.attributes]) child.removeAttribute(a.name)
      walk(child)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

// The month as whole weeks, Monday first — the shape their calendar is drawn in.
function weeksOf(month) {
  const firstOfMonth = `${month}-01`
  const dow = (new Date(firstOfMonth + 'T00:00:00Z').getUTCDay() + 6) % 7   // Mon = 0
  const start = addDays(firstOfMonth, -dow)
  const [y, m] = month.split('-').map(Number)
  const lastOfMonth = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
  const weeks = []
  for (let d = start; d <= lastOfMonth || weeks.length < 1; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)))
    if (weeks[weeks.length - 1][6] >= lastOfMonth) break
  }
  return weeks
}

export default function TeamupArchive({ month, monthLabel }) {
  const [cals, setCals] = useState(null)
  const [events, setEvents] = useState(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    listTeamupSubcalendars()
      .then((c) => { if (alive) setCals(c) })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setEvents(null); setErr(''); setOpen(null)
    listTeamupMonth(month)
      .then((e) => { if (alive) setEvents(e) })
      // NOT swallowed: an empty archive and an unreadable one look identical on
      // screen, which is exactly how the first version failed silently.
      .catch((e) => { if (alive) { setErr(e.message); setEvents([]) } })
    return () => { alive = false }
  }, [month])

  // Esc closes the entry, the way every other panel in the app behaves.
  useEffect(() => {
    if (!open) return
    const k = (e) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  const calName = useMemo(() => {
    const m = new Map()
    for (const c of cals || []) m.set(c.id, c.name)
    return m
  }, [cals])

  const weeks = useMemo(() => weeksOf(month), [month])

  // Which calendars are actually in use this month — that is the key worth
  // printing, not all twenty-five every time.
  const used = useMemo(() => {
    const seen = new Map()
    for (const e of events || []) {
      for (const c of (e.calendars.length ? e.calendars : ['none'])) {
        if (!seen.has(c)) seen.set(c, calName.get(c) || (c === 'none' ? 'No calendar' : `Calendar ${c}`))
      }
    }
    return [...seen.entries()].sort((a, z) => a[1].localeCompare(z[1]))
  }, [events, calName])

  if (!events) return <div className="cx-tu"><p className="cx-empty">Reading the Teamup copy…</p></div>
  if (err && !events.length) return <div className="cx-tu"><p className="cx-empty">{err}</p></div>

  return (
    <div className="cx-tu">
      <div className="cx-tu-bar">
        <b>Teamup, as it was</b>
        <span>{monthLabel}</span>
        <span>{events.length} {events.length === 1 ? 'entry' : 'entries'}</span>
        <span className="cx-tu-ro">read-only copy</span>
      </div>

      <div className="cx-tu-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>

      <div className="cx-tu-month">
        {weeks.map((week) => {
          const from = week[0]
          const to = week[6]
          // Everything touching this week, laid into lanes — spanning entries
          // and single days alike, which is how a month view is built.
          const lanes = []
          const laid = (events || [])
            .filter((e) => e.start <= to && e.end >= from)
            .sort((a, z) => a.start.localeCompare(z.start) || between(z.start, z.end) - between(a.start, a.end))
            .map((e) => {
              const s = e.start < from ? from : e.start
              const en = e.end > to ? to : e.end
              const col = between(from, s)
              const span = Math.max(1, between(s, en) + 1)
              let i = 0
              while (i < lanes.length && lanes[i] > col) i++
              if (i === lanes.length) lanes.push(0)
              lanes[i] = col + span
              return { e, col, span, lane: i, startsHere: e.start >= from, endsHere: e.end <= to }
            })
          const laneN = lanes.length
          return (
            <div className="cx-tu-week" key={from} style={{ '--lanes': laneN }}>
              {week.map((d) => (
                <div key={d} className={'cx-tu-day' + (d.slice(0, 7) !== month ? ' out' : '')}>
                  <span className="cx-tu-num">{Number(d.slice(8))}</span>
                </div>
              ))}
              {laid.map(({ e, col, span, lane, startsHere, endsHere }) => {
                const cal = e.calendars[0] || 'none'
                const hue = hueFor(cal)
                return (
                  <button key={e.id + ':' + from} type="button"
                    className={'cx-tu-pill'
                      + (startsHere ? '' : ' cont-l') + (endsHere ? '' : ' cont-r')
                      + (open?.id === e.id ? ' on' : '') + (e.gone ? ' gone' : '')}
                    style={{
                      left: `calc(${(col / 7) * 100}% + 3px)`,
                      width: `calc(${(span / 7) * 100}% - 6px)`,
                      top: `calc(var(--numh) + ${lane} * 21px)`,
                      '--h': hue,
                    }}
                    title={`${e.title}${e.who ? ` — ${e.who}` : ''}`}
                    onClick={() => setOpen(e)}>
                    <i />{!e.allDay && e.startTime ? <em>{e.startTime}</em> : null}{e.title}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {used.length > 0 && (
        <div className="cx-tu-key">
          <b>Their calendars</b>
          {used.map(([id, name]) => (
            <span key={id}><i style={{ '--h': hueFor(id) }} />{name}</span>
          ))}
          <em>colours are ours — Teamup’s own were never copied across, only the names</em>
        </div>
      )}

      {open && (
        <div className="cx-tu-modal" role="dialog" aria-modal="true" aria-label={open.title}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(null) }}>
          <div className="cx-tu-card" style={{ '--h': hueFor(open.calendars[0] || 'none') }}>
            <header>
              <span className="cx-tu-cal">{open.calendars.map((c) => calName.get(c) || c).join(' · ') || 'No calendar'}</span>
              <h3>{open.title}</h3>
              <button type="button" className="cx-icon" aria-label="Close" onClick={() => setOpen(null)}>✕</button>
            </header>

            <div className="cx-tu-when">
              <b>{open.start === open.end ? fmt(open.start) : `${fmt(open.start)} – ${fmt(open.end)}`}</b>
              <span>
                {open.allDay ? 'All day'
                  : open.startTime ? `${open.startTime}${open.endTime ? ` – ${open.endTime}` : ''}` : ''}
                {open.start !== open.end ? ` · ${between(open.start, open.end) + 1} days` : ''}
              </span>
            </div>

            <div className="cx-tu-meta">
              {open.who && <p><span>Who</span>{open.who}</p>}
              {open.location && <p><span>Where</span>{open.location}</p>}
              <p><span>In SGAS</span>
                {open.became ? `Became a ${open.became}.` : 'Nothing was made from it.'}
                {open.gone ? ' Since deleted in Teamup.' : ''}
              </p>
            </div>

            {open.notesHtml ? (
              <div className="cx-tu-note">
                {/* Their words, their formatting — crossings-out included, because
                    that is how a cancellation was written down. */}
                <div dangerouslySetInnerHTML={{ __html: safeNotes(open.notesHtml) }} />
              </div>
            ) : <p className="cx-tu-nonote">Nothing was written on this one.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
