import { useEffect, useMemo, useState } from 'react'
import { listTeamupMonth, listTeamupSubcalendars } from '../lib/api.js'
import { fmt } from '../lib/util.js'

// ─────────────────────────────────────────────────────────────────────────────
// THEIR CALENDAR, AS IT WAS.
//
// Chris: "I need to flip to the Teamup as is, not an interpretation."
//
// So this is NOT the SGAS calendar with Teamup data on it. It is laid out the
// way their Teamup is laid out — one row per sub-calendar, days across — with
// their names, their titles, and their notes in the formatting they were
// written in. Nothing here is re-worded, re-coloured or re-grouped, and nothing
// is editable. It is the copy they keep when the subscription lapses.
//
// The one thing that is ADDED is a quiet note of what became of an entry in
// SGAS, because the question "did this one come across?" is the whole reason
// for looking. It is stated as a fact about SGAS, never as a change to theirs.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const between = (a, b) => Math.round((dnum(b) - dnum(a)) / DAY)

/* Their notes are HTML they typed in Teamup, and the formatting carries
   meaning — numbered lists are the candidate order, <del> is a cancellation.
   So it is kept, not stripped. What is removed is everything that could
   execute or load: this is text from another system and it is rendered into
   our page. Tags are allow-listed, every attribute is dropped, and href is not
   in the list, so a link becomes plain text rather than something to click. */
const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'del', 's', 'strike', 'br', 'p',
  'ul', 'ol', 'li', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre'])

export function safeNotes(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue                    // text, fine
      if (child.nodeType !== 1) { child.remove(); continue } // comments etc.
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED.has(tag)) {
        // Unwrap rather than delete, so the words inside a stripped <a> survive.
        const keep = tag === 'script' || tag === 'style' || tag === 'iframe'
        if (keep) { child.remove(); continue }
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
      // NOT swallowed. An empty archive and an unreadable one look identical on
      // screen, and that is exactly how the first version failed silently.
      .catch((e) => { if (alive) { setErr(e.message); setEvents([]) } })
    return () => { alive = false }
  }, [month])

  const first = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = `${month}-${String(days).padStart(2, '0')}`

  const calName = useMemo(() => {
    const map = new Map()
    for (const c of cals || []) map.set(c.id, c.name)
    return map
  }, [cals])

  // Only the sub-calendars that actually have something this month, in their
  // own order — an empty row for each of twenty-five every month is noise.
  const rows = useMemo(() => {
    if (!events) return []
    const byCal = new Map()
    for (const e of events) {
      const ids = e.calendars.length ? e.calendars : ['none']
      for (const id of ids) {
        if (!byCal.has(id)) byCal.set(id, [])
        byCal.get(id).push(e)
      }
    }
    return [...byCal.entries()]
      .map(([id, list]) => ({ id, name: id === 'none' ? 'No calendar' : (calName.get(id) || `Calendar ${id}`), list }))
      .sort((a, z) => a.name.localeCompare(z.name))
  }, [events, calName])

  if (err && !events?.length) {
    return (
      <div className="cx-tu-wrap">
        <p className="cx-empty">{err}</p>
      </div>
    )
  }
  if (!events) return <div className="cx-tu-wrap"><p className="cx-empty">Reading the Teamup copy…</p></div>

  return (
    <div className="cx-tu-wrap">
      <div className="cx-tu-head">
        <b>Teamup as it was</b>
        <span>{monthLabel}</span>
        <span>{events.length} {events.length === 1 ? 'entry' : 'entries'} on {rows.length} of their calendars</span>
      </div>

      {rows.length === 0 && <p className="cx-empty">Nothing was on their calendar this month.</p>}

      <div className="cx-tu-grid">
        {/* The date scale, so a bar can be read off a day. */}
        <div className="cx-tu-row cx-tu-scale">
          <div className="cx-tu-label" />
          <div className="cx-tu-track">
            {Array.from({ length: days }, (_, i) => (
              <span key={i} style={{ left: `${(i / days) * 100}%`, width: `${(1 / days) * 100}%` }}>
                {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}
              </span>
            ))}
          </div>
        </div>

        {rows.map((row) => {
          // One lane per overlapping run, same as their week view stacks them.
          const lanes = []
          const laid = row.list
            .slice()
            .sort((a, z) => a.start.localeCompare(z.start))
            .map((e) => {
              const s = e.start < first ? first : e.start
              const en = e.end > last ? last : e.end
              const col = Math.max(0, between(first, s))
              const span = Math.max(1, Math.min(days - col, between(s, en) + 1))
              let i = 0
              while (i < lanes.length && lanes[i] > col) i++
              if (i === lanes.length) lanes.push(0)
              lanes[i] = col + span
              return { e, col, span, lane: i }
            })
          const laneN = Math.max(1, ...laid.map((x) => x.lane + 1))
          return (
            <div className="cx-tu-row" key={row.id}>
              <div className="cx-tu-label" title={row.name}>{row.name}</div>
              <div className="cx-tu-track" style={{ height: laneN * 24 + 8 }}>
                {Array.from({ length: days }, (_, i) => (
                  <i key={i} className="cx-tu-cell"
                    style={{ left: `${(i / days) * 100}%`, width: `${(1 / days) * 100}%` }} />
                ))}
                {laid.map(({ e, col, span, lane }) => (
                  <button key={e.id + ':' + row.id} type="button"
                    className={'cx-tu-ev' + (open?.id === e.id ? ' on' : '') + (e.gone ? ' gone' : '')}
                    style={{ left: `calc(${(col / days) * 100}% + 1px)`,
                      width: `calc(${(span / days) * 100}% - 2px)`, top: lane * 24 + 4 }}
                    title={`${e.title}${e.who ? ` — ${e.who}` : ''}`}
                    onClick={() => setOpen(open?.id === e.id ? null : e)}>
                    {e.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {open && (
        <div className="cx-tu-detail">
          <div className="cx-tu-dh">
            <b>{open.title}</b>
            <button type="button" className="cx-x" onClick={() => setOpen(null)} aria-label="Close">×</button>
          </div>
          <dl className="cx-tu-facts">
            <dt>When</dt>
            <dd>
              {open.start === open.end ? fmt(open.start) : `${fmt(open.start)} – ${fmt(open.end)}`}
              {open.allDay ? ' · all day' : open.startTime ? ` · ${open.startTime}–${open.endTime || ''}` : ''}
            </dd>
            {open.who && <><dt>Who</dt><dd>{open.who}</dd></>}
            {open.location && <><dt>Where</dt><dd>{open.location}</dd></>}
            <dt>Calendar</dt>
            <dd>{open.calendars.map((c) => calName.get(c) || c).join(', ') || '—'}</dd>
            <dt>In SGAS</dt>
            <dd>{open.became ? `It became a ${open.became}.` : 'Nothing was made from it.'}
              {open.gone ? ' It has since been deleted in Teamup.' : ''}</dd>
          </dl>
          {open.notesHtml
            ? (
              <div className="cx-tu-notes">
                {/* Their words, their formatting — struck-through lines included,
                    because that is how a cancellation was written down. */}
                <div dangerouslySetInnerHTML={{ __html: safeNotes(open.notesHtml) }} />
              </div>
            )
            : <p className="cx-empty">No notes were written on this one.</p>}
        </div>
      )}
    </div>
  )
}
