import { useEffect, useMemo, useState, useCallback } from 'react'
import { listBlocks, listCourses, createBlock } from '../lib/api.js'
import { toast } from '../lib/toast.js'

/* ----------------------------------------------------------------------------
 * SGAS Year view — a custom, Teamup-style scheduler. Each MONTH is one horizontal
 * row; days are laid out as weekday-aligned columns (Mon-start). Multi-day course
 * blocks render as colour bars (course colour) and stack into lanes when they
 * overlap. This matches the linear year layout the team know from Teamup.
 * -------------------------------------------------------------------------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const COLS = 37 // max columns: offset up to 6 + 31 days
const PREFS_KEY = 'sgas_year_prefs'
const todayISO = () => new Date().toISOString().slice(0, 10)
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const mondayOffset = (y, m) => (new Date(y, m, 1).getDay() + 6) % 7

function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} } }
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ } }

export default function YearCalendar({ go }) {
  const saved = loadPrefs()
  const now = new Date()
  const [count, setCount] = useState(saved.count || 12)
  const [startY, setStartY] = useState(saved.startY || now.getFullYear())
  const [startM, setStartM] = useState(saved.startM ?? now.getMonth())
  const [scheme, setScheme] = useState(saved.scheme || '')
  const [colourBy, setColourBy] = useState(saved.colourBy || 'course')

  const [blocks, setBlocks] = useState(null)
  const [courses, setCourses] = useState([])
  const [openBlock, setOpenBlock] = useState(null)

  const refresh = useCallback(async () => {
    const [b, c] = await Promise.all([listBlocks(), listCourses()])
    setBlocks(b); setCourses(c)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { savePrefs({ count, startY, startM, scheme, colourBy }) }, [count, startY, startM, scheme, colourBy])

  const schemes = useMemo(() => [...new Set((courses || []).map((c) => c.scheme).filter(Boolean))].sort(), [courses])

  const filtered = useMemo(() => {
    let list = blocks || []
    if (scheme) list = list.filter((b) => b.scheme === scheme)
    return list
  }, [blocks, scheme])

  function colourFor(b) {
    if (colourBy === 'status') return b.ready ? '#1f9d55' : '#b7791f'
    return b.color || '#48566a'
  }

  // The list of months to render.
  const months = useMemo(() => {
    const out = []
    let y = startY, m = startM
    for (let i = 0; i < count; i++) {
      out.push({ y, m })
      m++; if (m > 11) { m = 0; y++ }
    }
    return out
  }, [startY, startM, count])

  function shift(dir) {
    let m = startM + dir, y = startY
    if (m > 11) { m = 0; y++ } if (m < 0) { m = 11; y-- }
    setStartM(m); setStartY(y)
  }

  return (
    <div className="yc-wrap">
      <div className="cal-toolbar">
        <div className="cal-nav-grp">
          <button className="cal-nav" onClick={() => shift(-1)}>‹</button>
          <button className="btn ghost sm" onClick={() => { setStartY(now.getFullYear()); setStartM(now.getMonth()) }}>Today</button>
          <button className="cal-nav" onClick={() => shift(1)}>›</button>
          <span className="cal-label">{MONTHS[startM]} {startY} →</span>
        </div>
        <div className="cal-filters">
          <label className="yc-months">Number of months
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <select value={scheme} onChange={(e) => setScheme(e.target.value)}>
            <option value="">All schemes</option>
            {schemes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} title="Colour blocks by">
            <option value="course">Colour: course</option>
            <option value="scheme">Colour: scheme</option>
            <option value="status">Colour: status</option>
          </select>
        </div>
      </div>

      {blocks === null ? (
        <div className="loading">Loading calendar…</div>
      ) : (
        <div className="yc">
          <div className="yc-head">
            <div className="yc-mlabel" />
            <div className="yc-dowrow">
              {Array.from({ length: COLS }, (_, c) => <div className="yc-dow" key={c}>{DOW[c % 7]}</div>)}
            </div>
          </div>
          {months.map(({ y, m }) => (
            <MonthRow key={`${y}-${m}`} y={y} m={m} blocks={filtered} colourFor={colourFor} onOpen={setOpenBlock} />
          ))}
        </div>
      )}

      {openBlock && <BlockDrawer b={openBlock} go={go} onClose={() => setOpenBlock(null)} />}
    </div>
  )
}

function MonthRow({ y, m, blocks, colourFor, onOpen }) {
  const dim = new Date(y, m + 1, 0).getDate()
  const offset = mondayOffset(y, m)
  const first = isoOf(y, m, 1)
  const last = isoOf(y, m, dim)
  const today = todayISO()

  // Blocks that touch this month → clipped bars with start/end columns.
  const bars = useMemo(() => {
    const out = []
    for (const b of blocks) {
      if (!b.start || !b.end) continue
      if (b.end < first || b.start > last) continue
      const cs = b.start < first ? first : b.start
      const ce = b.end > last ? last : b.end
      const sd = Number(cs.slice(8, 10))
      const ed = Number(ce.slice(8, 10))
      out.push({ b, startCol: offset + sd - 1, endCol: offset + ed - 1 })
    }
    // Lane packing (greedy): earliest start first, reuse a lane once it's free.
    out.sort((a, c) => a.startCol - c.startCol || a.endCol - c.endCol)
    const laneEnds = []
    for (const bar of out) {
      let placed = false
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] < bar.startCol) { bar.lane = i; laneEnds[i] = bar.endCol; placed = true; break }
      }
      if (!placed) { bar.lane = laneEnds.length; laneEnds.push(bar.endCol) }
    }
    return { list: out, lanes: laneEnds.length || 1 }
  }, [blocks, y, m])

  // Today marker column (only if today is in this month).
  const todayCol = today.slice(0, 7) === first.slice(0, 7) ? offset + Number(today.slice(8, 10)) - 1 : -1

  return (
    <div className="yc-row">
      <div className="yc-mlabel">{MONTHS[m]}<small>{y}</small></div>
      <div className="yc-track" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `18px repeat(${bars.lanes}, 22px)` }}>
        {/* day-number / grid cells */}
        {Array.from({ length: COLS }, (_, c) => {
          const inMonth = c >= offset && c < offset + dim
          const day = c - offset + 1
          const dateStr = inMonth ? isoOf(y, m, day) : null
          const isToday = dateStr === today
          const isWeekend = (c % 7) >= 5
          return (
            <div key={c} className={'yc-cell' + (inMonth ? '' : ' out') + (isWeekend && inMonth ? ' wknd' : '') + (isToday ? ' today' : '')}
              style={{ gridColumn: c + 1, gridRow: `1 / span ${bars.lanes + 1}` }}>
              {inMonth && <span className="yc-dn">{day}</span>}
            </div>
          )
        })}
        {todayCol >= 0 && <div className="yc-todaybar" style={{ gridColumn: todayCol + 1, gridRow: `1 / span ${bars.lanes + 1}` }} />}
        {/* event bars */}
        {bars.list.map(({ b, startCol, endCol, lane }) => (
          <button key={b.id} className="yc-bar" title={`${b.course} · ${b.start}–${b.end} · ${b.delegates.length} delegate(s)${b.trainer ? ' · ' + b.trainer : ''}`}
            onClick={() => onOpen(b)}
            style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 2, background: colourFor(b) }}>
            <span className="yc-bar-t">{b.course} {b.delegates.length ? `· ${b.delegates.length}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function BlockDrawer({ b, go, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cal-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cal-drawer-head" style={{ borderLeft: `5px solid ${b.color || '#48566a'}` }}>
          <h3>{b.course}</h3>
          <span className="muted small">{b.start} – {b.end} · {b.scheme || '—'}</span>
        </div>
        <div className="cal-drawer-roles muted small">
          Trainer: {b.trainer || '—'} · Assessor: {b.assessor || '—'} · Verifier: {b.verifier || '—'}
          {!b.ready && <span className="cal-warn"> · ⚠ needs trainer + delegates</span>}
        </div>
        <div className="cal-drawer-body">
          <strong>Delegates ({b.delegates.length})</strong>
          {b.delegates.length === 0 && <div className="muted small">None yet.</div>}
          <ul className="cal-delg">
            {b.delegates.map((d) => (
              <li key={d.bookingId}>{d.name}{d.codes?.length ? <span className="muted"> · {d.codes.join(', ')}</span> : null}</li>
            ))}
          </ul>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          {go && <button className="btn" onClick={() => { onClose(); go('sched') }}>Open in Schedule →</button>}
        </div>
      </div>
    </div>
  )
}
