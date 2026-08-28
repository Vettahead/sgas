import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listBlocks, listCourses, listStaff, listHolidays, getPool, loadPool,
  addDelegatesToBlock, assignBlockRole, updateBlock, returnToPool, staffOnHoliday,
} from '../lib/api.js'
import { todayISO, fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'
import Modal from '../components/Modal.jsx'

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

const THEME_KEY = 'sgas_cx_theme'
const DENSE_KEY = 'sgas_cx_dense'
const readLS = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }

export default function CalendarNext({ isAdmin, user, go }) {
  const [blocks, setBlocks] = useState(null)
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [pool, setPool] = useState([])
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [dir, setDir] = useState(0)              // -1 back, +1 forward: drives the slide
  const [open, setOpen] = useState(null)         // the course being viewed
  const [theme, setTheme] = useState(() => readLS(THEME_KEY, 'light'))
  const [dense, setDense] = useState(() => readLS(DENSE_KEY, '0') === '1')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  async function load() {
    const [b, s, h] = await Promise.all([listBlocks(), listStaff(), listHolidays()])
    setBlocks(b); setStaff(s); setHolidays(h); setPool(getPool())
    return b
  }
  useEffect(() => { (async () => { try { await loadPool() } catch { /* optional */ } await load() })() }, [])
  useEffect(() => { try { localStorage.setItem(THEME_KEY, theme) } catch { /* private */ } }, [theme])
  useEffect(() => { try { localStorage.setItem(DENSE_KEY, dense ? '1' : '0') } catch { /* private */ } }, [dense])

  const step = (n) => { setDir(n); setMonth((m) => { const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7) }) }
  const goToday = () => { setDir(0); setMonth(todayISO().slice(0, 7)) }

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
    const last = grid.days[grid.days.length - 1]
    for (const b of blocks) {
      if (!b.start || !b.end || b.end < grid.start || b.start > last) continue
      let cur = b.start < grid.start ? grid.start : b.start
      const fin = b.end > last ? last : b.end
      while (cur <= fin) {
        const i = between(grid.start, cur)
        const col = i % 7, row = Math.floor(i / 7)
        const span = Math.min(7 - col, between(cur, fin) + 1)
        out.push({ b, row, col, span, key: b.id + ':' + cur, head: cur === b.start })
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
  }, [blocks, grid])

  const lanesIn = (r) => Math.max(0, ...segments.filter((s) => s.row === r).map((s) => s.lane + 1), 0)

  // ── The agenda rail: what is actually coming up ───────────────────────────
  const inMonth = (b) => b.start.slice(0, 7) <= month && b.end.slice(0, 7) >= month
  const thisMonth = useMemo(() => (blocks || [])
    .filter((b) => !b.isHoliday && !b.isEngagement && inMonth(b))
    .sort((a, z) => a.start.localeCompare(z.start)), [blocks, month])
  const needsWork = useMemo(
    () => thisMonth.filter((b) => !b.trainerId || !b.delegates.length), [thisMonth])
  const monthLabel = MONTHS[Number(month.slice(5, 7)) - 1]

  // ── Drag to create, drag a bar to move ───────────────────────────────────
  const [sel, setSel] = useState(null)
  const dragRef = useRef(null)
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
      setSel((s) => { if (ok && s && s.from !== s.to) toast(`Would create ${fmt(s.from)} – ${fmt(s.to)} — this is the demo`); return null })
    }
    const up = end(true), cx = end(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cx)
  }
  function barDown(b, e) {
    if (!isAdmin) return
    e.preventDefault(); e.stopPropagation()
    const cell = document.querySelector('.cx-cell')
    const w = cell ? cell.getBoundingClientRect().width : 100
    const x0 = e.clientX, el = e.currentTarget.closest('.cx-bar')
    dragRef.current = { moved: false, delta: 0 }
    const move = (ev) => {
      const dx = ev.clientX - x0
      dragRef.current.delta = Math.round(dx / w)
      if (Math.abs(dx) > 4) dragRef.current.moved = true
      el.style.transform = `translateX(${dx}px)`; el.style.zIndex = 9; el.style.opacity = '.9'
    }
    const up = async () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      el.style.transform = ''; el.style.zIndex = ''; el.style.opacity = ''
      const { delta, moved } = dragRef.current || {}
      dragRef.current = null
      if (!moved || !delta) return
      setBusy(true)
      try {
        await updateBlock(b.id, { from: addDays(b.start, delta), to: addDays(b.end, delta) })
        await load(); setFlash(String(b.id)); setTimeout(() => setFlash(null), 800)
      } catch (err) { toast(err.message) } finally { setBusy(false) }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  const inSel = (d) => sel && d >= sel.from && d <= sel.to
  const title = MONTHS[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4)

  return (
    <div className={'cx' + (theme === 'dark' ? ' cx-dark' : '') + (dense ? ' cx-dense' : '')}>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <header className="cx-bar-top">
        <div className="cx-title-wrap">
          <h2 className="cx-title">{title}</h2>
          <div className="cx-steps">
            <button onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <button onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <button className="cx-today" onClick={goToday}>Today</button>
        </div>
        <div className="cx-tools">
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

      <div className="cx-body">
        {/* ── Month grid ──────────────────────────────────────────────── */}
        <section className="cx-cal" aria-label={'Courses in ' + title}>
          <div className="cx-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>

          {blocks === null ? (
            <div className="cx-skel">{Array.from({ length: 35 }, (_, i) => <div key={i} />)}</div>
          ) : (
            <div className={'cx-grid ' + (dir < 0 ? 'from-left' : dir > 0 ? 'from-right' : 'fade')} key={month}>
              {Array.from({ length: grid.rows }, (_, r) => (
                <div className="cx-week" key={r} style={{ '--lanes': lanesIn(r) }}>
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
                    <button key={s.key} type="button"
                      className={'cx-bar' + (s.b.isHoliday ? ' hol' : '') + (!s.b.ready ? ' warn' : '') + (flash === String(s.b.id) ? ' flash' : '')}
                      style={{
                        left: `calc(${(s.col / 7) * 100}% + 4px)`,
                        width: `calc(${(s.span / 7) * 100}% - 8px)`,
                        top: `calc(var(--numh) + ${s.lane} * var(--barh) + ${s.lane} * 3px)`,
                        '--c': s.b.color || '#5b6b80',
                      }}
                      onPointerDown={(e) => { if (e.target.classList.contains('cx-grab')) barDown(s.b, e) }}
                      onClick={() => { if (!dragRef.current?.moved) setOpen(s.b) }}>
                      {isAdmin && !s.b.isHoliday && <span className="cx-grab" aria-hidden="true" />}
                      <span className="cx-bar-t">
                        {s.head ? (s.b.course || s.b.title) : '↳ ' + (s.b.course || '')}
                        {s.head && s.b.delegates?.length > 0 && <em>{s.b.delegates.length}</em>}
                      </span>
                      {s.head && !s.b.ready && !s.b.isHoliday && <span className="cx-dot" title="Needs a trainer or delegates" />}
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
                <button key={b.id} className="cx-row" onClick={() => setOpen(b)}>
                  <i style={{ background: b.color || '#5b6b80' }} />
                  <span><b>{b.course}</b><small>{!b.trainerId ? 'no trainer' : 'no delegates'} · {fmt(b.start)}</small></span>
                </button>
              ))}
            </div>
          )}
          <div className="cx-card">
            <h3>In {monthLabel} <span>{thisMonth.length}</span></h3>
            {thisMonth.length === 0 && <p className="cx-empty">No courses this month.</p>}
            {thisMonth.slice(0, 7).map((b) => (
              <button key={b.id} className="cx-row" onClick={() => setOpen(b)}>
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

      {open && (
        <Modal onClose={() => setOpen(null)} label={open.course} className="cx-modal">
          <div className="cx-mhead" style={{ '--c': open.color || '#5b6b80' }}>
            <div>
              <h3>{open.course}</h3>
              <p>{fmt(open.start)} – {fmt(open.end)} · {open.scheme || 'no scheme'}</p>
            </div>
            <button className="cx-icon" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          </div>
          <div className="cx-mbody">
            <div className="cx-field">
              <label>Trainer</label>
              {isAdmin ? (
                <select value={open.trainerId || ''} disabled={busy} onChange={async (e) => {
                  setBusy(true)
                  try {
                    await assignBlockRole(open.id, 'trainer', Number(e.target.value))
                    const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast('Trainer set')
                  } catch (err) { toast(err.message) } finally { setBusy(false) }
                }}>
                  <option value="">— none yet —</option>
                  {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>
                    {s.name}{staffOnHoliday(holidays, s.staff_id, open.start, open.end) ? ' (on holiday)' : ''}
                  </option>)}
                </select>
              ) : <p>{open.trainer || '—'}</p>}
            </div>
            <div className="cx-field">
              <label>On this course <span className="cx-count">{open.delegates.length}</span></label>
              {open.delegates.length === 0
                ? <p className="cx-empty">Nobody yet.</p>
                : <ul className="cx-delg">{open.delegates.map((d) => (
                    <li key={d.bookingId}>
                      <span>{d.name}{d.codes?.length ? <small> · {d.codes.join(', ')}</small> : null}</span>
                      {isAdmin && <button className="cx-x" disabled={busy} onClick={async () => {
                        setBusy(true)
                        try { await returnToPool(d.bookingId); const f = await load(); setOpen(f.find((x) => x.id === open.id) || null) }
                        catch (err) { toast(err.message) } finally { setBusy(false) }
                      }}>remove</button>}
                    </li>))}
                  </ul>}
            </div>
            {isAdmin && pool.length > 0 && (
              <div className="cx-field">
                <label>Add from the waiting list</label>
                <div className="cx-chips">
                  {pool.slice(0, 8).map((p) => (
                    <button key={p.id} className="cx-chip" disabled={busy} onClick={async () => {
                      setBusy(true)
                      try { await addDelegatesToBlock(open.id, [p.id]); const f = await load(); setOpen(f.find((x) => x.id === open.id) || null); toast(`${p.name} added`) }
                      catch (err) { toast(err.message) } finally { setBusy(false) }
                    }}>＋ {p.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
