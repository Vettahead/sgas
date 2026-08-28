import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listBlocks, listCourses, listStaff, listHolidays, getPool, loadPool,
  addDelegatesToBlock, assignBlockRole, updateBlock, returnToPool, staffOnHoliday,
  createBlock, setBookingAttendance,
} from '../lib/api.js'
import { todayISO, fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'
import Modal from '../components/Modal.jsx'
import Popover from '../components/Popover.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR (NEW) — a visual revamp, on its own tab. Nothing existing is touched.
//
// Same structure as the calendar people already know — a month grid you drag on
// — but rebuilt to stop feeling like a spreadsheet: real type hierarchy, room
// to breathe, motion that explains what just happened, an agenda rail so the
// week reads at a glance, and a dark mode.
//
// Everything is namespaced `.cx-` so it cannot collide with the live calendar.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const addDays = (s, n) => iso(dnum(s) + n * DAY)
const between = (a, b) => Math.round((dnum(b) - dnum(a)) / DAY)
const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay()
const isWknd = (s) => dow(s) === 0 || dow(s) === 6
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// How each delegate on a course is counted. The bar carries a stripe of these
// so a mixed course reads at a glance without opening it.
const KIND = {
  NEW:      { c: '#1f9d55', label: 'New' },
  REASSESS: { c: '#2f6fd0', label: 'Reassessment' },
  MIXED:    { c: '#7b2ff2', label: 'Mixed' },
  NYC:      { c: '#b7791f', label: 'Not yet competent' },
  NO_SHOW:  { c: '#c0392b', label: 'No-show' },
}
const kindOf = (k) => KIND[k] || KIND.NEW
// A delegate doing only part of a course — the "split" case.
const isPart = (d) => !!(d.attendFrom || d.attendTo)

const VIEW_KEY = 'sgas_cx_view'
const THEME_KEY = 'sgas_cx_theme'
const DENSE_KEY = 'sgas_cx_dense'
const readLS = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

export default function CalendarNext({ isAdmin, user, go }) {
  const [blocks, setBlocks] = useState(null)
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [pool, setPool] = useState([])
  const [view, setView] = useState(() => readLS(VIEW_KEY, 'Month'))
  // One date drives every view. Keeping a separate `month` meant paging to
  // July in Month and then clicking Week threw you back to today.
  const [anchor, setAnchor] = useState(todayISO())
  const month = anchor.slice(0, 7)
  const [dir, setDir] = useState(0)              // -1 back, +1 forward: drives the slide
  const [open, setOpen] = useState(null)         // the course being viewed
  const [theme, setTheme] = useState(() => readLS(THEME_KEY, 'light'))
  const [dense, setDense] = useState(() => readLS(DENSE_KEY, '0') === '1')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)
  const [courses, setCourses] = useState([])
  const [creating, setCreating] = useState(null)   // { from, to } after a drag
  const [hint, setHint] = useState(null)  // the chip that rides the bar you drag
  // While a course is being dragged its dates live here, and the whole grid
  // lays out from them. Nudging inline width/transform could not reflow a
  // course across a week boundary, so shrinking a two-row course looked stuck.
  const [preview, setPreview] = useState(null)     // { id, start, end }
  // A drag ends with a click. Without this the click opened the course you had
  // just finished dragging.
  const justDragged = useRef(false)
  const [at, setAt] = useState(null)   // the bar the popover is anchored to
  const [jump, setJump] = useState(false)
  const [jumpY, setJumpY] = useState(() => Number(todayISO().slice(0, 4)))

  async function load() {
    const [b, s, h, cs] = await Promise.all([listBlocks(), listStaff(), listHolidays(), listCourses()])
    setBlocks(b); setStaff(s); setHolidays(h); setPool(getPool())
    setCourses(cs.filter((c) => c.is_active !== false))
    return b
  }
  useEffect(() => { (async () => { try { await loadPool() } catch { /* optional */ } await load() })() }, [])
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme) } catch { /* private */ } }, [theme])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* private */ } }, [view])
  useEffect(() => { try { localStorage.setItem(DENSE_KEY, dense ? '1' : '0') } catch { /* private */ } }, [dense])

  const step = (n) => {
    setDir(n)
    if (view === 'Week') return setAnchor((a) => addDays(a, n * 7))
    if (view === 'Day') return setAnchor((a) => addDays(a, n))
    const by = view === 'Year' ? 12 : 1
    setAnchor((a) => {
      const d = new Date(a + 'T00:00:00Z')
      const day = d.getUTCDate()
      d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n * by)
      const len = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
      d.setUTCDate(Math.min(day, len))
      return d.toISOString().slice(0, 10)
    })
  }
  const goToday = () => { setDir(0); setAnchor(todayISO()) }
  // Open a course beside the bar you clicked, not over the middle of the screen.
  const openAt = (b, e) => {
    if (justDragged.current) return
    const r = e.currentTarget.getBoundingClientRect()
    // A course bar can be most of a week wide; anchoring to the whole thing
    // pushed the popover across the grid and hid the bar you were editing.
    const x = e.clientX ?? (r.left + r.width / 2)
    setAt({ left: x - 10, right: x + 10, width: 20, top: r.top, bottom: r.bottom, height: r.height })
    setOpen(b)
  }
  // Dragging the dates from inside the popover, the same commit path the
  // drag-on-the-grid uses.
  const saveDates = async (from, to) => {
    const next = { from: from || open.start, to: to || open.end }
    if (next.to < next.from) next.to = next.from
    setBusy(true)
    try {
      await updateBlock(open.id, next)
      const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Dates changed')
    } catch (err) { toast(err.message) } finally { setBusy(false) }
  }
  useEffect(() => { setJumpY(Number(month.slice(0, 4))) }, [month])
  useEffect(() => {
    if (!jump) return
    const off = (e) => { if (!e.target.closest?.('.cx-jump, .cx-title')) setJump(false) }
    const esc = (e) => { if (e.key === 'Escape') setJump(false) }
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [jump])

  // Monday-first week containing the anchor.
  const weekDays = useMemo(() => {
    const back = (dow(anchor) + 6) % 7
    const mon = addDays(anchor, -back)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }, [anchor])
  const viewDays = view === 'Day' ? [anchor] : weekDays

  // Blocks as they should currently be drawn — the live drag included.
  const shown = useMemo(() => (blocks || []).map((b) => (
    preview && preview.id === b.id ? { ...b, start: preview.start, end: preview.end } : b
  )), [blocks, preview])

  // ── The six-week grid ─────────────────────────────────────────────────────
  const grid = useMemo(() => {
    const first = month + '-01'
    const lead = (dow(first) + 6) % 7                       // Monday-first
    const start = addDays(first, -lead)
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    // Six rows are only needed when the month actually spills into one.
    const rows = days[35] && days[35].slice(0, 7) === month ? 6 : 5
    return { start, days: days.slice(0, rows * 7), rows }
  }, [month])

  // A block becomes one segment per week row it crosses.
  const segments = useMemo(() => {
    const out = []
    if (!blocks) return out
    const blocksForLayout = shown
    const last = grid.days[grid.days.length - 1]
    for (const b of blocksForLayout) {
      if (!b.start || !b.end || b.end < grid.start || b.start > last) continue
      let cur = b.start < grid.start ? grid.start : b.start
      const fin = b.end > last ? last : b.end
      while (cur <= fin) {
        const i = between(grid.start, cur)
        const col = i % 7, row = Math.floor(i / 7)
        const span = Math.min(7 - col, between(cur, fin) + 1)
        out.push({ b, row, col, span, key: b.id + ':' + cur, head: cur === b.start,
          tail: addDays(cur, span - 1) >= fin })
        cur = addDays(cur, span)
      }
    }
    // Lane-pack each row so overlapping courses stack instead of hiding.
    const byRow = new Map()
    for (const s of out) { if (!byRow.has(s.row)) byRow.set(s.row, []); byRow.get(s.row).push(s) }
    for (const list of byRow.values()) {
      list.sort((a, z) => a.col - z.col || z.span - a.span)
      const lanes = []
      for (const s of list) {
        let i = 0
        while (i < lanes.length && lanes[i] > s.col) i++
        if (i === lanes.length) lanes.push(0)
        lanes[i] = s.col + s.span; s.lane = i
      }
    }
    return out
  }, [shown, blocks, grid])

  const lanesIn = (r) => Math.max(0, ...segments.filter((s) => s.row === r).map((s) => s.lane + 1), 0)

  // ── The agenda rail: what is actually coming up ───────────────────────────
  // In Year view the rail has to cover the year, or it says "no courses this
  // month" next to a screen full of them.
  const inRange = (b) => (view === 'Year'
    ? b.start.slice(0, 4) <= month.slice(0, 4) && b.end.slice(0, 4) >= month.slice(0, 4)
    : b.start.slice(0, 7) <= month && b.end.slice(0, 7) >= month)
  const thisMonth = useMemo(() => (shown || [])
    .filter((b) => !b.isHoliday && !b.isEngagement && inRange(b))
    .sort((a, z) => a.start.localeCompare(z.start)), [shown, month, view])
  // Scoped to the month, this hid overdue problems the moment you paged away
  // from them. An alert is only an alert if it follows you.
  const needsWork = useMemo(() => (shown || [])
    .filter((b) => !b.isHoliday && !b.isEngagement && (!b.trainerId || !b.delegates.length))
    .sort((a, z) => a.start.localeCompare(z.start)), [shown])
  const monthLabel = view === 'Year' ? month.slice(0, 4) : MONTHS[Number(month.slice(5, 7)) - 1]

  // ── Drag to create, drag a bar to move ───────────────────────────────────
  const [sel, setSel] = useState(null)
  function cellDown(d, e) {
    if (!isAdmin || (e.button != null && e.button !== 0)) return
    setSel({ from: d, to: d })
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const c = el?.closest?.('.cx-cell')
      if (c?.dataset.d) setSel({ from: d < c.dataset.d ? d : c.dataset.d, to: d < c.dataset.d ? c.dataset.d : d })
    }
    const end = (ok) => () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cx)
      setSel((s) => { if (ok && s && s.from !== s.to) setCreating({ from: s.from, to: s.to }); return null })
    }
    const up = end(true), cx = end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cx)
  }
  // Dragging a course. Three things make this feel right and all three were
  // missing: the bar has to follow in WHOLE DAY steps (pixel-following then
  // snapping on release feels mushy), its CSS transition has to be off while
  // you drag (or it rubber-bands a frame behind the pointer), and the resize
  // has to measure its starting width ONCE — reading offsetWidth each frame
  // just fed the bar its own value back, so it never moved at all.
  function barDown(b, e, mode) {
    if (!isAdmin) return
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget.closest('.cx-bar')
    // Every draggable grid says how many columns it has, so one handler serves
    // the month, week and year views.
    const track = el.closest('[data-cols]')
    if (!track) return
    const colW = track.getBoundingClientRect().width / Number(track.dataset.cols)
    const x0 = e.clientX
    const spanDays = between(b.start, b.end) + 1
    el.setPointerCapture?.(e.pointerId)
    document.body.classList.add('cx-dragging')
    let delta = 0, moved = false

    const dates = (d) => {
      const from = mode === 'move' ? addDays(b.start, d) : b.start
      let to = addDays(b.end, d)
      if (to < from) to = from
      return { from, to }
    }

    const move = (ev) => {
      const dx = ev.clientX - x0
      if (Math.abs(dx) > 3) moved = true
      let d = Math.round(dx / colW)
      // Never shorter than a single day; otherwise shrink as far as you like,
      // including back down from a course that wrapped onto another week.
      if (mode === 'resize') d = Math.max(d, -(spanDays - 1))
      if (d !== delta) {
        delta = d
        const { from, to } = dates(d)
        // Re-lay the grid from these dates, so a course that spans two weeks
        // reflows as you drag instead of being stuck at its old shape.
        setPreview({ id: b.id, start: from, end: to })
      }
      const { from, to } = dates(delta)
      const n = between(from, to) + 1
      setHint(`${n} day${n === 1 ? '' : 's'} · ${fmt(from)} – ${fmt(to)}`)
    }

    const finish = async (commit) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.body.classList.remove('cx-dragging')
      setHint(null)
      if (moved) {
        // Swallow the click this drag is about to produce.
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 250)
      }
      if (!commit || !moved || !delta) { setPreview(null); return }
      const { from, to } = dates(delta)
      // Keep it where it was dropped while the save runs.
      setBlocks((bs) => (bs || []).map((x) => (x.id === b.id ? { ...x, start: from, end: to } : x)))
      setPreview(null)
      setFlash(String(b.id)); setTimeout(() => setFlash(null), 800)
      setBusy(true)
      try { await updateBlock(b.id, { from, to }); await load() }
      catch (err) { toast(err.message); await load() }
      finally { setBusy(false) }
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const inSel = (d) => sel && d >= sel.from && d <= sel.to
  const title = view === 'Day'
    ? new Date(anchor + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : view === 'Week'
      ? `${fmt(weekDays[0])} – ${fmt(weekDays[6])}`
      : view === 'Year'
        ? month.slice(0, 4)
        : MONTHS[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4)

  return (
    <div className={'cx' + (theme === 'dark' ? ' cx-dark' : '') + (dense ? ' cx-dense' : '')}>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <header className="cx-bar-top">
        <div className="cx-title-wrap">
          {/* Paging one month at a time from July to November was four clicks. */}
          <button type="button" className="cx-title" aria-haspopup="true" aria-expanded={jump}
            onClick={() => setJump((j) => !j)}>{title}<i /></button>
          {jump && (
            <div className="cx-jump" role="dialog" aria-label="Jump to a month">
              <div className="cx-jump-y">
                <button onClick={() => setJumpY((y) => y - 1)} aria-label="Previous year">‹</button>
                <b>{jumpY}</b>
                <button onClick={() => setJumpY((y) => y + 1)} aria-label="Next year">›</button>
              </div>
              <div className="cx-jump-g">
                {MONTHS.map((mn, i) => (
                  <button key={mn} className={month === `${jumpY}-${String(i + 1).padStart(2, '0')}` ? 'on' : ''}
                    onClick={() => { setDir(0); setAnchor(`${jumpY}-${String(i + 1).padStart(2, '0')}-01`); setJump(false) }}>
                    {mn.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="cx-steps">
            <button onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <button onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <button className="cx-today" onClick={goToday}>Today</button>
        </div>
        <div className="cx-tools">
          <div className="cx-seg" role="group" aria-label="View">
            {['Day', 'Week', 'Month', 'Year'].map((v) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => { setDir(0); setView(v) }}>{v}</button>
            ))}
          </div>
          <div className="cx-seg" role="group" aria-label="Density">
            <button className={dense ? '' : 'on'} onClick={() => setDense(false)}>Comfortable</button>
            <button className={dense ? 'on' : ''} onClick={() => setDense(true)}>Compact</button>
          </div>
          <button className="cx-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          {isAdmin && <button className="cx-primary" onClick={() => go?.('setup')}>＋ New course</button>}
        </div>
      </header>

      <div className="cx-legend">
        <b>Dots on a course — why each person is there:</b>
        {Object.entries(KIND).filter(([k]) => k !== 'MIXED').map(([k, v]) => (
          <span key={k}><i style={{ background: v.c }} />{v.label}</span>
        ))}
        <span><i className="cx-l-part" />Doing part of it</span>
        <span className="cx-l-sep" />
        <b>The bar itself:</b>
        <span><i className="cx-l-course" />Coloured by course</span>
        <span><i className="cx-l-warn" />Needs a trainer or delegates</span>
      </div>

      <div className="cx-body">
        {/* ── Month grid ──────────────────────────────────────────────── */}
        <section className="cx-cal" aria-label={'Courses — ' + title}>
          {view === 'Month' && <div className="cx-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>}

          {blocks === null ? (
            <div className="cx-skel">{Array.from({ length: 35 }, (_, i) => <div key={i} />)}</div>
          ) : view === 'Year' ? (
            <YearGrid year={month.slice(0, 4)} blocks={shown} onOpen={openAt} isAdmin={isAdmin}
              onBarDown={barDown} flash={flash} chip={hint && preview ? { id: preview.id, text: hint } : null} />
          ) : view !== 'Month' ? (
            <DaysGrid days={viewDays} blocks={shown} onOpen={openAt} isAdmin={isAdmin}
              onBarDown={barDown} flash={flash} single={view === 'Day'} chip={hint && preview ? { id: preview.id, text: hint } : null} />
          ) : (
            <div className={'cx-grid ' + (dir < 0 ? 'from-left' : dir > 0 ? 'from-right' : 'fade')} key={month}>
              {Array.from({ length: grid.rows }, (_, r) => (
                <div className="cx-week" data-cols="7" key={r} style={{ '--lanes': lanesIn(r) }}>
                  {Array.from({ length: 7 }, (_, c) => {
                    const d = grid.days[r * 7 + c]
                    const out = d.slice(0, 7) !== month
                    const today = d === todayISO()
                    return (
                      <div key={d} data-d={d}
                        className={'cx-cell' + (out ? ' out' : '') + (isWknd(d) ? ' wknd' : '') + (today ? ' today' : '') + (inSel(d) ? ' sel' : '')}
                        onPointerDown={(e) => cellDown(d, e)}>
                        <span className="cx-num">{today ? <b>{Number(d.slice(8))}</b> : Number(d.slice(8))}</span>
                      </div>
                    )
                  })}
                  {segments.filter((s) => s.row === r).map((s) => (
                    <button key={s.key} type="button" data-bid={s.b.id} data-head={s.head ? '1' : '0'}
                      className={'cx-bar' + (s.b.isHoliday ? ' hol' : '') + (!s.b.ready ? ' warn' : '') + (flash === String(s.b.id) ? ' flash' : '')}
                      style={{
                        left: `calc(${(s.col / 7) * 100}% + 4px)`,
                        width: `calc(${(s.span / 7) * 100}% - 8px)`,
                        top: `calc(var(--numh) + ${s.lane} * var(--barh) + ${s.lane} * 3px)`,
                        '--c': s.b.color || '#5b6b80',
                      }}
                      onPointerDown={(e) => {
                        if (e.target.classList.contains('cx-grab')) barDown(s.b, e, 'move')
                        else if (e.target.classList.contains('cx-resize')) barDown(s.b, e, 'resize')
                      }}
                      onClick={(e) => openAt(s.b, e)}>
                      {isAdmin && !s.b.isHoliday && s.head && <span className="cx-grab" aria-hidden="true" title="Drag to move the whole course" />}
                      <span className="cx-bar-t">
                        {s.head ? (s.b.course || s.b.title) : '↳ ' + (s.b.course || '')}
                        {s.head && s.b.delegates?.some(isPart) && <span className="cx-part" title="Somebody is doing only part of this course">◧</span>}
                        {s.head && s.b.delegates?.length > 0 && <em>{s.b.delegates.length}</em>}
                      </span>
                      {/* One segment per delegate, coloured by what they are
                          here for — a mixed course reads without opening it. */}
                      {s.head && s.b.delegates?.length > 0 && (
                        <span className="cx-mix" aria-hidden="true">
                          {s.b.delegates.slice(0, 10).map((d) => (
                            <i key={d.bookingId} style={{ background: kindOf(d.kind).c, opacity: isPart(d) ? 0.5 : 1 }} />
                          ))}
                        </span>
                      )}
                      {s.head && !s.b.ready && !s.b.isHoliday && <span className="cx-dot" title="Needs a trainer or delegates" />}
                      {isAdmin && !s.b.isHoliday && s.tail && <span className="cx-resize" aria-hidden="true" title="Drag to change how many days it runs" />}
                      {hint && preview?.id === s.b.id && s.head && <span className="cx-chip-len">{hint}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Agenda rail ─────────────────────────────────────────────── */}
        <aside className="cx-rail">
          {needsWork.length > 0 && (
            <div className="cx-card cx-warn">
              <h3>Needs attention <span>{needsWork.length}</span></h3>
              {needsWork.slice(0, 4).map((b) => (
                <button key={b.id} className="cx-row" onClick={(e) => openAt(b, e)}>
                  <i style={{ background: b.color || '#5b6b80' }} />
                  <span><b>{b.course}</b><small>{!b.trainerId ? 'no trainer' : 'no delegates'} · {fmt(b.start)}</small></span>
                </button>
              ))}
            </div>
          )}
          <div className="cx-card">
            <h3>In {monthLabel} <span>{thisMonth.length}</span></h3>
            {thisMonth.length === 0 && <p className="cx-empty">No courses {view === 'Year' ? 'this year' : 'this month'}.</p>}
            {thisMonth.slice(0, 7).map((b) => (
              <button key={b.id} className="cx-row" onClick={(e) => openAt(b, e)}>
                <i style={{ background: b.color || '#5b6b80' }} />
                <span>
                  <b>{b.course}</b>
                  <small>{fmt(b.start)} – {fmt(b.end)} · {b.trainer || 'no trainer'} · {b.delegates.length} on it</small>
                </span>
              </button>
            ))}
          </div>
          <div className="cx-card">
            <h3>Waiting to be placed <span>{pool.length}</span></h3>
            {pool.length === 0 && <p className="cx-empty">Nobody waiting.</p>}
            {pool.slice(0, 5).map((p) => (
              <div key={p.id} className="cx-row static">
                <i style={{ background: '#22a06b' }} />
                <span><b>{p.name}</b><small>{p.scheme || '—'} · {p.count} qual{p.count === 1 ? '' : 's'}</small></span>
              </div>
            ))}
          </div>
        </aside>
      </div>



      {creating && (
        <Modal onClose={() => setCreating(null)} label="New course" className="cx-modal" dirty={!!creating.courseId}>
          <div className="cx-mhead" style={{ '--c': courses.find((c) => String(c.course_id) === String(creating.courseId))?.color || '#5b6b80' }}>
            <div>
              <h3>New course</h3>
              <p>{fmt(creating.from)} – {fmt(creating.to)} · {between(creating.from, creating.to) + 1} days</p>
            </div>
            <button className="cx-icon" onClick={() => setCreating(null)} aria-label="Close">✕</button>
          </div>
          <div className="cx-mbody">
            <div className="cx-field">
              <label>Which course</label>
              <select value={creating.courseId || ''} onChange={(e) => setCreating({ ...creating, courseId: e.target.value })}>
                <option value="">— pick one —</option>
                {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="cx-actions">
              <button className="cx-ghost" onClick={() => { const r = creating; setCreating(null); go?.('setup') }}>
                Use the full set-up instead
              </button>
              <button className="cx-primary" disabled={!creating.courseId || busy} onClick={async () => {
                setBusy(true)
                try {
                  const id = await createBlock({ courseId: Number(creating.courseId), from: creating.from, to: creating.to })
                  setCreating(null)
                  const f = await load()
                  const made = f.find((x) => String(x.id) === String(id))
                  setFlash(String(id)); setTimeout(() => setFlash(null), 900)
                  if (made) { setAt(null); setOpen(made) }
                  toast('Course created — add a trainer and delegates')
                } catch (err) { toast(err.message) } finally { setBusy(false) }
              }}>{busy ? 'Creating…' : 'Create it'}</button>
            </div>
          </div>
        </Modal>
      )}

      {open && (
        <Popover at={at} onClose={() => setOpen(null)} label={open.course} className="cx-course-pop">
          {/* No edit mode. You type into it and it saves — the way Calendars
              does it — instead of asking you to unlock the thing first. */}
          <header className="cx-pop-head" style={{ '--c': open.color || '#5b6b80' }}>
            <span className="cx-pop-dot" />
            {isAdmin ? (
              <select className="cx-pop-title" value={open.courseId || ''} disabled={busy}
                onChange={async (e) => {
                  setBusy(true)
                  try {
                    await updateBlock(open.id, { courseId: Number(e.target.value) })
                    const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Course changed')
                  } catch (err) { toast(err.message) } finally { setBusy(false) }
                }}>
                {!courses.some((c) => String(c.course_id) === String(open.courseId)) &&
                  <option value={open.courseId || ''}>{open.course}</option>}
                {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}</option>)}
              </select>
            ) : <h3 className="cx-pop-title">{open.course}</h3>}
            <button className="cx-icon" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          </header>

          {/* The dates as two blocks you can read across, not two small inputs. */}
          {/* One object, read across — two separate boxes and a floating pill
              made three things out of one fact. */}
          <div className="cx-when">
            <label className="cx-when-b">
              <small>Starts</small>
              <input type="date" value={open.start} disabled={!isAdmin || busy}
                onChange={(e) => saveDates(e.target.value, null)} />
              <b>{fmt(open.start)}</b>
            </label>
            <span className="cx-when-arrow" aria-hidden="true">›</span>
            <label className="cx-when-b">
              <small>Ends</small>
              <input type="date" value={open.end} min={open.start} disabled={!isAdmin || busy}
                onChange={(e) => saveDates(null, e.target.value)} />
              <b>{fmt(open.end)}</b>
            </label>
            <span className="cx-when-len">{between(open.start, open.end) + 1} days</span>
          </div>

          <div className="cx-rows">
            {/* Quiet rows you fill in as you need them, rather than a form
                showing every field at once. */}
            <div className={'cx-row2' + (open.trainerId ? '' : ' empty')}>
              <span className="cx-ricon" aria-hidden="true">👤</span>
              <span className="cx-rwrap">
              <span className="cx-rlabel">Trainer</span>
              {isAdmin ? (
                <select value={open.trainerId || ''} disabled={busy} aria-label="Trainer" onChange={async (e) => {
                  setBusy(true)
                  try {
                    await assignBlockRole(open.id, 'trainer', Number(e.target.value))
                    const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Trainer set')
                  } catch (err) { toast(err.message) } finally { setBusy(false) }
                }}>
                  <option value="">Add a trainer</option>
                  {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>
                    {s.name}{staffOnHoliday(holidays, s.staff_id, open.start, open.end) ? ' (on holiday)' : ''}
                  </option>)}
                </select>
              ) : <span className="cx-rtext">{open.trainer || 'No trainer'}</span>}
              </span>
            </div>

            <div className={'cx-row2 top' + (open.delegates.length ? '' : ' empty')}>
              <span className="cx-ricon" aria-hidden="true">👥</span>
              <div className="cx-rfill">
                <span className="cx-rlabel">On this course{open.delegates.length ? ` · ${open.delegates.length}` : ''}</span>
                {open.delegates.length === 0
                  ? <span className="cx-rtext">Nobody booked on yet</span>
                  : <ul className="cx-delg">{open.delegates.map((d) => (
                      <Delegate key={d.bookingId} d={d} block={open} isAdmin={isAdmin} busy={busy}
                        onSplit={async (f, t) => {
                          setBusy(true)
                          try { await setBookingAttendance(d.bookingId, f, t); const x = await load(); setOpen(x.find((y) => y.id === open.id) || null); toast(f || t ? 'Part attendance set' : 'Back to the full course') }
                          catch (err) { toast(err.message) } finally { setBusy(false) }
                        }}
                        onRemove={async () => {
                          setBusy(true)
                          try { await returnToPool(d.bookingId); const x = await load(); setOpen(x.find((y) => y.id === open.id) || null) }
                          catch (err) { toast(err.message) } finally { setBusy(false) }
                        }} />))}
                    </ul>}
                {/* Quiet until you want it — eight name chips permanently on
                    show made the popover twice as tall as it needed to be. */}
                {isAdmin && pool.length > 0 && (
                  <details className="cx-add">
                    <summary>Add someone from the waiting list<span>{pool.length}</span></summary>
                    <div className="cx-chips">
                      {pool.slice(0, 10).map((p) => (
                        <button key={p.id} className="cx-chip" disabled={busy} onClick={async () => {
                          setBusy(true)
                          try { await addDelegatesToBlock(open.id, [p.id]); const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast(`${p.name} added`) }
                          catch (err) { toast(err.message) } finally { setBusy(false) }
                        }}>＋ {p.name}</button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>

            <div className="cx-row2 empty">
              <span className="cx-ricon" aria-hidden="true">🏷</span>
              <span className="cx-rwrap">
                <span className="cx-rlabel">Scheme</span>
                <span className="cx-rtext">{open.scheme || 'No scheme'}</span>
              </span>
            </div>
          </div>
          {/* There is no Save button, so the popover has to say so. */}
          <footer className="cx-pop-foot">
            {busy ? <><span className="cx-spin" />Saving…</> : <>✓ Changes save as you make them</>}
          </footer>
        </Popover>
      )}
    </div>
  )
}

/* One person on a course: what they are here for, and whether they are only
   doing part of it — the "split" case. */
function Delegate({ d, block, isAdmin, busy, onSplit, onRemove }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(d.attendFrom || block.start)
  const [t, setT] = useState(d.attendTo || block.end)
  const part = isPart(d)
  const k = kindOf(d.kind)
  return (
    <li className={part ? 'part' : ''}>
      <span className="cx-kind" style={{ background: k.c }} title={k.label} />
      <span className="cx-dinfo">
        <b>{d.name}</b>
        <small>
          {k.label}
          {d.codes?.length ? ' · ' + d.codes.join(', ') : ''}
          {part ? ` · ${fmt(d.attendFrom || block.start)}–${fmt(d.attendTo || block.end)} only` : ' · full course'}
        </small>
      </span>
      {isAdmin && !edit && <button className="cx-x" onClick={() => setEdit(true)}>{part ? 'change days' : 'only some days'}</button>}
      {isAdmin && !edit && (
        <button className="cx-x danger" disabled={busy}
          onClick={() => { if (window.confirm(`Take ${d.name} off this course? They go back on the waiting list.`)) onRemove() }}>
          take off
        </button>
      )}
      {edit && (
        <span className="cx-split">
          <input type="date" value={f} min={block.start} max={block.end} onChange={(e) => setF(e.target.value)} />
          <input type="date" value={t} min={block.start} max={block.end} onChange={(e) => setT(e.target.value)} />
          <button className="cx-x" disabled={busy} onClick={() => { onSplit(f, t); setEdit(false) }}>save</button>
          <button className="cx-x" disabled={busy} onClick={() => { onSplit(null, null); setEdit(false) }}>all of it</button>
          <button className="cx-x" onClick={() => setEdit(false)}>cancel</button>
        </span>
      )}
    </li>
  )
}

/* ── Week and Day ──────────────────────────────────────────────────────────
   Courses run all day and for several days, so the band across the top is the
   main event, not an afterthought above a time grid. Below it sits the hour
   grid for timed entries, with a line showing where we are now. */
const H0 = 7, H1 = 20, HPX = 46
function DaysGrid({ days, blocks, onOpen, isAdmin, onBarDown, flash, single, chip }) {
  const [hours, setHours] = useState(false)
  const first = days[0], last = days[days.length - 1]
  const allDay = useMemo(() => {
    const list = (blocks || []).filter((b) => b.start && b.end && b.end >= first && b.start <= last
      && !(b.isEngagement && b.startTime))
    const lanes = []
    return list.sort((a, z) => a.start.localeCompare(z.start) || between(z.start, z.end) - between(a.start, a.end))
      .map((b) => {
        const col = Math.max(0, between(first, b.start))
        const span = Math.min(days.length - col, between(b.start < first ? first : b.start, b.end > last ? last : b.end) + 1)
        let i = 0
        while (i < lanes.length && lanes[i] > col) i++
        if (i === lanes.length) lanes.push(0)
        lanes[i] = col + span
        return { b, col, span, lane: i }
      })
  }, [blocks, first, last, days.length])
  const laneCount = Math.max(1, ...allDay.map((x) => x.lane + 1))

  const timed = (blocks || []).filter((b) => b.isEngagement && b.startTime && b.start >= first && b.start <= last)
  const mins = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5))
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNow = days.includes(todayISO()) && nowMin >= H0 * 60 && nowMin <= H1 * 60

  return (
    <div className={'cx-days' + (single ? ' one' : '')}>
      <div className="cx-days-head">
        <div className="cx-gutter" />
        {days.map((d) => (
          <div key={d} className={'cx-dhead' + (d === todayISO() ? ' today' : '') + (isWknd(d) ? ' wknd' : '')}>
            <span>{DOW[(dow(d) + 6) % 7]}</span>
            <b>{Number(d.slice(8))}</b>
          </div>
        ))}
      </div>

      {/* All-day band — where courses live. In Day view it just repeated the
          name of the course sitting in the card below it, so it is dropped. */}
      {!single && (
      <div className="cx-band-wrap">
        <div className="cx-gutter"><span>All day</span></div>
        <div className="cx-band" data-cols={days.length} style={{ height: laneCount * 28 + 10 }}>
          {days.map((d) => <div key={d} className={'cx-band-cell' + (isWknd(d) ? ' wknd' : '')} />)}
          {allDay.map(({ b, col, span, lane }) => (
            <button key={b.id} type="button" data-bid={b.id}
              className={'cx-bar' + (b.isHoliday ? ' hol' : '') + (!b.ready && !b.isHoliday && !b.isEngagement ? ' warn' : '') + (flash === String(b.id) ? ' flash' : '')}
              style={{ left: `calc(${(col / days.length) * 100}% + 4px)`, width: `calc(${(span / days.length) * 100}% - 8px)`,
                top: lane * 28 + 5, height: 24, '--c': b.color || '#5b6b80' }}
              onPointerDown={(e) => {
                if (!isAdmin || b.isHoliday) return
                if (e.target.classList.contains('cx-grab')) onBarDown(b, e, 'move')
                else if (e.target.classList.contains('cx-resize')) onBarDown(b, e, 'resize')
              }}
              onClick={(e) => onOpen(b, e)}>
              {isAdmin && !b.isHoliday && b.start >= first && <span className="cx-grab" title="Drag to move" />}
              <span className="cx-bar-t">
                {b.course || b.title}
                {b.delegates?.some(isPart) && <span className="cx-part">◧</span>}
                {b.delegates?.length > 0 && <em>{b.delegates.length}</em>}
              </span>
              {b.delegates?.length > 0 && (
                <span className="cx-mix">{b.delegates.slice(0, 10).map((d) => (
                  <i key={d.bookingId} style={{ background: kindOf(d.kind).c, opacity: isPart(d) ? 0.5 : 1 }} />))}</span>
              )}
              {isAdmin && !b.isHoliday && b.end <= last && <span className="cx-resize" title="Drag to change the length" />}
              {chip && String(chip.id) === String(b.id) && <span className="cx-chip-len">{chip.text}</span>}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* A roster, not a second copy of the bar. In Day view the question is
          never "what time" — courses run all day — it is "who is on it and
          who is teaching it". */}
      {single && (
        <div className="cx-roster">
          {allDay.length === 0 && <p className="cx-empty">Nothing booked on this day.</p>}
          {allDay.map(({ b }) => (
            <article key={b.id} className="cx-rcard" style={{ '--c': b.color || '#5b6b80' }}>
              <header>
                <button type="button" className="cx-rname" onClick={(e) => onOpen(b, e)}>{b.course || b.title}</button>
                <span className="cx-rdate">{fmt(b.start)} – {fmt(b.end)}</span>
              </header>
              <p className={'cx-rtrainer' + (b.trainerId ? '' : ' none')}>
                {b.trainerId ? (b.trainer || 'Trainer booked') : 'No trainer yet'}
              </p>
              {b.delegates?.length ? (
                <ul className="cx-rlist">
                  {b.delegates.map((d) => (
                    <li key={d.bookingId}>
                      <i style={{ background: kindOf(d.kind).c, opacity: isPart(d) ? 0.5 : 1 }} />
                      <b>{d.name}</b>
                      <span>{kindOf(d.kind).label}{isPart(d) ? ' · part of it' : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="cx-rnone">Nobody booked on yet.</p>}
            </article>
          ))}
        </div>
      )}

      {/* Hour grid — only worth its space when something actually has a time
          on it. Almost every course here is an all-day, multi-day thing, so an
          empty 07:00–20:00 ruler was most of the screen saying nothing. */}
      {timed.length === 0 && !hours ? (
        <button type="button" className="cx-hours-toggle" onClick={() => setHours(true)}>
          Courses run all day · show the hour grid
        </button>
      ) : (<>
      {timed.length === 0 && (
        <button type="button" className="cx-hours-toggle" onClick={() => setHours(false)}>
          Nothing has a time on it {single ? 'today' : 'this week'} · hide the hour grid
        </button>
      )}
      <div className="cx-time">
        <div className="cx-gutter">
          {Array.from({ length: H1 - H0 }, (_, i) => (
            <div key={i} className="cx-hour" style={{ height: HPX }}><span>{String(H0 + i).padStart(2, '0')}:00</span></div>
          ))}
        </div>
        <div className="cx-cols">
          {days.map((d) => (
            <div key={d} className={'cx-col' + (isWknd(d) ? ' wknd' : '')} style={{ height: (H1 - H0) * HPX }}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div key={i} className="cx-hline" style={{ top: i * HPX }} />)}
              {timed.filter((t) => t.start === d).map((t) => (
                <button key={t.id} className="cx-ev" onClick={(e) => onOpen(t, e)}
                  style={{ top: ((mins(t.startTime) - H0 * 60) / 60) * HPX,
                    height: Math.max(22, ((mins(t.endTime) - mins(t.startTime)) / 60) * HPX - 2) }}>
                  <b>{t.title || t.course}</b><span>{String(t.startTime).slice(0, 5)}</span>
                </button>
              ))}
              {showNow && d === todayISO() && (
                <div className="cx-now" style={{ top: ((nowMin - H0 * 60) / 60) * HPX }}>
                  <i /><b>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      </>)}
    </div>
  )
}

/* ── Year ──────────────────────────────────────────────────────────────────
   Months as rows, the whole year in one screen. This is the view Teamup did
   well and the one Simon reads the shape of the business from. */
function YearGrid({ year, blocks, onOpen, isAdmin, onBarDown, flash, chip }) {
  const y = Number(year)
  const TICKS = [1, 5, 10, 15, 20, 25, 31]
  return (
    <div className="cx-year">
      {/* Without a date scale you could see the shape of the year but not read
          a single date off it. */}
      <div className="cx-yhead" aria-hidden="true">
        <div className="cx-ylabel" />
        <div className="cx-ytrack">
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className={'cx-ytick' + (TICKS.includes(i + 1) ? ' on' : '')}
              style={{ left: `${(i / 31) * 100}%`, width: `${(1 / 31) * 100}%` }}>
              {TICKS.includes(i + 1) ? i + 1 : ''}
            </span>
          ))}
        </div>
      </div>
      {MONTHS.map((name, m) => {
        const first = `${y}-${String(m + 1).padStart(2, '0')}-01`
        const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
        const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`
        const rows = (blocks || []).filter((b) => b.start && b.end && b.end >= first && b.start <= last)
        const lanes = []
        const laid = rows.sort((a, z) => a.start.localeCompare(z.start)).map((b) => {
          const col = Math.max(0, between(first, b.start))
          const span = Math.min(dim - col, between(b.start < first ? first : b.start, b.end > last ? last : b.end) + 1)
          let i = 0
          while (i < lanes.length && lanes[i] > col) i++
          if (i === lanes.length) lanes.push(0)
          lanes[i] = col + span
          return { b, col, span, lane: i }
        })
        // How much clear room each bar has before the next one in its lane —
        // a name spilling over the following course is worse than no name.
        for (const x of laid) {
          const next = laid.filter((z) => z.lane === x.lane && z.col > x.col).sort((a, z) => a.col - z.col)[0]
          x.gap = (next ? next.col : 31) - (x.col + x.span)
        }
        const laneN = Math.max(1, ...laid.map((x) => x.lane + 1))
        return (
          <div className="cx-yrow" key={m}>
            <div className="cx-ylabel">{name.slice(0, 3)}</div>
            {/* Every row is drawn on the same 31-day scale — otherwise 1 Feb
                sat under 3 Jan and you could not read a date down a column. */}
            <div className="cx-ytrack" data-cols={31} style={{ height: laneN * 22 + 12 }}>
              {Array.from({ length: dim }, (_, i) => {
                const d = `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                return <div key={d} className={'cx-ycell' + (isWknd(d) ? ' wknd' : '') + (d === todayISO() ? ' today' : '')}
                  style={{ left: `${(i / 31) * 100}%`, width: `${(1 / 31) * 100}%` }} />
              })}
              {dim < 31 && <div className="cx-ydead" style={{ left: `${(dim / 31) * 100}%`, width: `${((31 - dim) / 31) * 100}%` }} />}
              {laid.map(({ b, col, span, lane, gap }) => (
                <button key={b.id} type="button" data-bid={b.id} title={`${b.course || b.title} · ${fmt(b.start)} – ${fmt(b.end)}`}
                  className={'cx-bar cx-ybar' + (b.isHoliday ? ' hol' : '') + (flash === String(b.id) ? ' flash' : '')}
                  style={{ left: `calc(${(col / 31) * 100}% + 2px)`, width: `calc(${(span / 31) * 100}% - 4px)`,
                    top: lane * 22 + 6, height: 18, '--c': b.color || '#5b6b80' }}
                  onPointerDown={(e) => {
                    if (!isAdmin || b.isHoliday) return
                    if (e.target.classList.contains('cx-grab')) onBarDown(b, e, 'move')
                    else if (e.target.classList.contains('cx-resize')) onBarDown(b, e, 'resize')
                  }}
                  onClick={(e) => onOpen(b, e)}>
                  {isAdmin && !b.isHoliday && <span className="cx-grab" />}
                  {/* A two-day course must not be padded out to fit its name —
                      the length of the bar has to stay honest. */}
                  {span >= 5 && <span className="cx-bar-t">{b.course || b.title}</span>}
                  {isAdmin && !b.isHoliday && <span className="cx-resize" />}
                  {/* A two-day course is too narrow to hold its own name, and a
                      nameless coloured pill is unreadable. Put it alongside. */}
                  {chip && String(chip.id) === String(b.id) && <span className="cx-chip-len">{chip.text}</span>}
                  {span < 5 && gap >= 3 && (
                    <span className="cx-yout" style={{ maxWidth: `calc(${(gap / 31) * 100}vw * 0 + ${(gap / span) * 100}% - 12px)` }}>
                      {b.course || b.title}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
