import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listBlocks, listCourses, listStaff, listHolidays, getPool, loadPool,
  addDelegatesToBlock, assignBlockRole, updateBlock, returnToPool, staffOnHoliday,
} from '../lib/api.js'
import { todayISO, fmt } from '../lib/util.js'
import { toast } from '../lib/toast.js'

// ─────────────────────────────────────────────────────────────────────────────
// PLANNER — the experimental calendar.
//
// The idea: ONE timeline instead of four separate views. Days are columns of a
// fixed pixel width, and zooming just changes that width — so a year and a day
// are the same screen at different scales, and every bar keeps its identity and
// slides to its new size. That is where the animation comes from: the bars are
// the same elements throughout, so a CSS transition does the morphing. No
// library, no redraw, and you never lose your place.
//
// Everything can be done two ways: DRAG it, or TAP it then tap the target.
// Tap-to-place is not a fallback — on a tablet it is the faster route, and it
// is what makes the screen usable by someone who has never seen it.
//
// Built on Pointer Events throughout, which is what makes it work on a tablet;
// the old calendar's library charges for that.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const iso = (d) => new Date(d).toISOString().slice(0, 10)
const dnum = (s) => Date.parse(s + 'T00:00:00Z')
const addDays = (s, n) => iso(dnum(s) + n * DAY)
const daysBetween = (a, b) => Math.round((dnum(b) - dnum(a)) / DAY)
const isWeekend = (s) => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 || d === 6 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Zoom is a continuous pixel-per-day value; these are just the labelled stops.
const ZOOMS = [
  { id: 'year', label: 'Year', px: 4 },
  { id: 'quarter', label: 'Quarter', px: 12 },
  { id: 'month', label: 'Month', px: 34 },
  { id: 'week', label: 'Week', px: 96 },
  { id: 'day', label: 'Day', px: 240 },
]
const ROW_H = 30
const LANE_GAP = 4

const KCOL = { NEW: '#1f9d55', REASSESS: '#2f6fd0', NYC: '#b7791f', NO_SHOW: '#c0392b', MIXED: '#7b2ff2' }
const kindColour = (k) => KCOL[k] || '#1f9d55'

// Greedy lane packing: first lane where this bar does not overlap what is there.
function packLanes(items) {
  const lanes = []
  const out = new Map()
  for (const it of [...items].sort((a, b) => a.start.localeCompare(b.start))) {
    let i = 0
    while (i < lanes.length && lanes[i] > dnum(it.start)) i++
    if (i === lanes.length) lanes.push(0)
    lanes[i] = dnum(it.end) + DAY
    out.set(it.id, i)
  }
  return { laneOf: out, count: Math.max(lanes.length, 1) }
}

export default function Planner({ isAdmin, user, go }) {
  const [blocks, setBlocks] = useState(null)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [holidays, setHolidays] = useState([])
  const [pool, setPool] = useState([])

  const [pxDay, setPxDay] = useState(34)
  const [groupBy, setGroupBy] = useState('course')   // course | trainer
  const [selected, setSelected] = useState(null)     // an open block
  // "Armed" = picked up by tapping. The next tap on a block places it.
  const [armed, setArmed] = useState(null)           // {type:'delegate'|'staff', id, label}
  const [dropTarget, setDropTarget] = useState(null) // block id currently under the pointer
  const [flash, setFlash] = useState(null)           // block id to pulse after a change
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  const reload = useCallback(async () => {
    const [b, c, s, h] = await Promise.all([listBlocks(), listCourses(), listStaff(), listHolidays()])
    setBlocks(b); setCourses(c); setStaff(s); setHolidays(h)
    setPool(getPool())
    return b
  }, [])

  useEffect(() => {
    (async () => {
      try { await loadPool() } catch { /* pool is optional */ }
      await reload()
    })()
  }, [reload])

  // ── The window of time on screen ──────────────────────────────────────────
  const span = useMemo(() => {
    // A planner looks forward. Blocks in this database run back to 2011, and an
    // unbounded span would be hundreds of thousands of pixels wide, so the
    // window is three months back to a year ahead, stretched to fit any block
    // inside that, and hard-capped at two years.
    const today = todayISO()
    const from = addDays(today, -92)
    const hardTo = addDays(today, 730)
    let to = addDays(today, 365)
    for (const b of blocks || []) if (b.end > to && b.end <= hardTo) to = b.end
    to = addDays(to, 14)
    return { from, to, days: daysBetween(from, to) + 1 }
  }, [blocks])

  // Blocks outside the window would render off the ends; count them so the
  // screen can say so rather than silently dropping them.
  const inWindow = useCallback((b) => b.end >= span.from && b.start <= span.to, [span])
  const outsideCount = useMemo(() => (blocks || []).filter((b) => !inWindow(b)).length, [blocks, inWindow])

  const xOf = useCallback((d) => daysBetween(span.from, d) * pxDay, [span.from, pxDay])
  const dateAtX = useCallback((x) => addDays(span.from, Math.round(x / pxDay)), [span.from, pxDay])

  // ── Rows ──────────────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    const all = blocks || []
    if (groupBy === 'trainer') {
      const byStaff = new Map()
      for (const b of all.filter(inWindow)) {
        const k = b.trainerId ? String(b.trainerId) : 'none'
        if (!byStaff.has(k)) byStaff.set(k, [])
        byStaff.get(k).push(b)
      }
      const list = (staff || []).map((s) => ({
        key: String(s.staff_id), label: s.name, colour: s.color,
        items: byStaff.get(String(s.staff_id)) || [],
      }))
      list.push({ key: 'none', label: 'No trainer yet', warn: true, items: byStaff.get('none') || [] })
      return list.filter((r) => r.items.length || r.key === 'none')
    }
    return [{ key: 'all', label: '', items: all.filter(inWindow) }]
  }, [blocks, staff, groupBy, inWindow])

  const laid = useMemo(() => rows.map((r) => ({ ...r, ...packLanes(r.items) })), [rows])

  // ── Things that need attention ────────────────────────────────────────────
  const attention = useMemo(() => {
    const out = []
    for (const b of blocks || []) {
      if (b.end < todayISO()) continue
      const why = []
      if (!b.trainerId) why.push('no trainer')
      if (!b.delegates.length) why.push('no delegates')
      if (b.trainerId && staffOnHoliday(holidays, b.trainerId, b.start, b.end)) why.push('trainer on holiday')
      if (why.length) out.push({ b, why })
    }
    return out.sort((a, b) => a.b.start.localeCompare(b.b.start))
  }, [blocks, holidays])

  // ── Placing something on a block ──────────────────────────────────────────
  async function place(blockId, item) {
    if (!isAdmin) return toast('Only an admin can change the schedule')
    const b = (blocks || []).find((x) => String(x.id) === String(blockId))
    if (!b) return
    setBusy(true)
    try {
      if (item.type === 'delegate') {
        await addDelegatesToBlock(b.id, [item.id])
        toast(`${item.label} added to ${b.course}`)
      } else {
        if (staffOnHoliday(holidays, item.id, b.start, b.end)) {
          toast(`${item.label} is on holiday then`); return
        }
        await assignBlockRole(b.id, 'trainer', item.id)
        toast(`${item.label} is now the trainer`)
      }
      const fresh = await reload()
      setSelected((prev) => (prev ? fresh.find((x) => x.id === prev.id) || null : null))
      setFlash(String(b.id)); setTimeout(() => setFlash(null), 900)
    } catch (e) { toast(e.message || 'Could not do that') } finally { setBusy(false); setArmed(null) }
  }

  async function moveBlock(b, deltaDays, mode) {
    if (!deltaDays) return
    let from = b.start, to = b.end
    if (mode === 'move') { from = addDays(from, deltaDays); to = addDays(to, deltaDays) }
    else { to = addDays(to, deltaDays); if (to < from) to = from }
    setBusy(true)
    try {
      await updateBlock(b.id, { from, to })
      await reload()
      setFlash(String(b.id)); setTimeout(() => setFlash(null), 900)
    } catch (e) { toast(e.message || 'Could not move that') } finally { setBusy(false) }
  }

  // ── Pointer drag: one path for mouse, touch and pen ───────────────────────
  const dragRef = useRef(null)
  function startBarDrag(b, e, mode) {
    if (!isAdmin) return
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget.closest('.pl-bar')
    const startX = e.clientX
    const w0 = el.offsetWidth
    el.setPointerCapture?.(e.pointerId)
    el.classList.add('dragging')
    dragRef.current = { moved: 0 }
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      dragRef.current.moved = Math.round(dx / pxDay)
      if (mode === 'move') el.style.transform = `translateX(${dx}px)`
      else el.style.width = Math.max(pxDay * 0.6, w0 + dx) + 'px'
    }
    const onUp = () => {
      el.releasePointerCapture?.(e.pointerId)
      el.classList.remove('dragging')
      el.style.transform = ''; el.style.width = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const d = dragRef.current?.moved || 0
      dragRef.current = null
      if (d) moveBlock(b, d, mode)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // Dragging a rail item. Nothing happens until the pointer actually moves ~5px,
  // so a plain tap stays a tap (pick up, then tap a course) and only a real drag
  // raises the ghost. Same code path for mouse, touch and pen.
  function startRailDrag(item, e) {
    if (!isAdmin) return
    const x0 = e.clientX, y0 = e.clientY
    let ghost = null
    const raise = (ev) => {
      ghost = document.createElement('div')
      ghost.className = 'pl-ghost'
      ghost.textContent = item.label
      document.body.appendChild(ghost)
      setArmed(item)
      put(ev)
    }
    const put = (ev) => { if (ghost) { ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 12 + 'px' } }
    const barUnder = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      return el && el.closest ? el.closest('.pl-bar') : null
    }
    const onMove = (ev) => {
      if (!ghost) {
        if (Math.abs(ev.clientX - x0) < 5 && Math.abs(ev.clientY - y0) < 5) return
        raise(ev)
      }
      put(ev)
      const bar = barUnder(ev)
      setDropTarget(bar ? bar.dataset.id : null)
    }
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!ghost) return                     // never moved — leave it to the click handler
      ghost.remove()
      setDropTarget(null)
      const bar = barUnder(ev)
      if (bar) place(bar.dataset.id, item); else setArmed(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // Escape clears an armed pick-up; +/- zoom.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setArmed(null); setSelected(null) }
      if (e.key === '+' || e.key === '=') setPxDay((p) => Math.min(240, Math.round(p * 1.35)))
      if (e.key === '-' || e.key === '_') setPxDay((p) => Math.max(3, Math.round(p / 1.35)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep today in view when the zoom changes.
  const zoomTo = (px) => {
    const sc = scrollRef.current
    const anchor = sc ? (sc.scrollLeft + sc.clientWidth / 2) / pxDay : 0
    setPxDay(px)
    requestAnimationFrame(() => { if (sc) sc.scrollLeft = anchor * px - sc.clientWidth / 2 })
  }
  useEffect(() => {
    const sc = scrollRef.current
    if (sc && blocks) sc.scrollLeft = Math.max(0, xOf(todayISO()) - sc.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks === null])

  if (blocks === null) return <div className="empty">Loading the planner…</div>

  const width = span.days * pxDay
  const showLabels = pxDay >= 22

  return (
    <div className={'pl' + (armed ? ' pl-arming' : '')}>
      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="body pl-bar-row">
          <div className="seg">
            {ZOOMS.map((z) => (
              <button key={z.id} className={Math.abs(pxDay - z.px) < 2 ? 'on' : ''} onClick={() => zoomTo(z.px)}>{z.label}</button>
            ))}
          </div>
          <input
            type="range" min="3" max="240" value={pxDay} className="pl-zoom"
            onChange={(e) => zoomTo(Number(e.target.value))}
            title="Zoom — or press + and -"
          />
          <div className="seg">
            <button className={groupBy === 'course' ? 'on' : ''} onClick={() => setGroupBy('course')}>Stacked</button>
            <button className={groupBy === 'trainer' ? 'on' : ''} onClick={() => setGroupBy('trainer')}>By trainer</button>
          </div>
          <button className="btn ghost sm" onClick={() => { const sc = scrollRef.current; if (sc) sc.scrollLeft = Math.max(0, xOf(todayISO()) - sc.clientWidth / 3) }}>Today</button>
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            {armed
              ? <b>Now tap a course to add {armed.label} — Esc to cancel</b>
              : outsideCount > 0
                ? `Drag, or tap something on the right then tap a course · ${outsideCount} older ${outsideCount === 1 ? 'course is' : 'courses are'} outside this window`
                : 'Drag, or tap something on the right then tap a course'}
          </span>
        </div>
      </div>

      <div className="pl-main">
        {/* ── Timeline ─────────────────────────────────────────────────── */}
        <div className="card pl-timeline">
          <div className="pl-scroll" ref={scrollRef}>
            <div className="pl-inner" style={{ width }}>
              <Ruler span={span} pxDay={pxDay} xOf={xOf} />
              {laid.map((row) => (
                <div className="pl-row" key={row.key}>
                  {groupBy === 'trainer' && (
                    <div className={'pl-rowlabel' + (row.warn ? ' warn' : '')}>
                      <span style={{ background: row.colour || 'var(--slate)' }} className="pl-dot" />
                      {row.label}
                    </div>
                  )}
                  <div className="pl-lanes" style={{ height: row.count * (ROW_H + LANE_GAP) + 6, ...weekendBg(span, pxDay) }}>
                    <Grid span={span} pxDay={pxDay} xOf={xOf} />
                    {row.items.map((b) => (
                      <Bar
                        key={b.id} b={b} lane={row.laneOf.get(b.id) || 0}
                        x={xOf(b.start)} w={Math.max(pxDay * 0.8, (daysBetween(b.start, b.end) + 1) * pxDay - 2)}
                        showLabels={showLabels} isAdmin={isAdmin}
                        armed={!!armed} isTarget={dropTarget === String(b.id)} flash={flash === String(b.id)}
                        onOpen={() => (armed ? place(b.id, armed) : setSelected(b))}
                        onDrag={(e, mode) => startBarDrag(b, e, mode)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Rail ─────────────────────────────────────────────────────── */}
        <div className="pl-rail">
          <Rail title="Waiting to be placed" count={pool.length} empty="Nobody waiting.">
            {pool.map((p) => (
              <RailItem
                key={p.id} armed={armed?.type === 'delegate' && armed.id === p.id}
                colour={kindColour(p.kind)} disabled={!isAdmin}
                onPick={() => setArmed({ type: 'delegate', id: p.id, label: p.name })}
                onDragStart={(e) => startRailDrag({ type: 'delegate', id: p.id, label: p.name }, e)}
                title={p.name} sub={`${p.scheme || '—'} · ${p.count} qual${p.count === 1 ? '' : 's'}${p.prefFrom ? ' · wants ' + fmt(p.prefFrom) : ''}`}
              />
            ))}
          </Rail>

          <Rail title="Needs attention" count={attention.length} empty="Everything upcoming is complete." tone="warn">
            {attention.map(({ b, why }) => (
              <button key={b.id} className="pl-att" onClick={() => setSelected(b)}>
                <span className="pl-att-c" style={{ background: b.color || 'var(--slate)' }} />
                <span>
                  <b>{b.course}</b>
                  <span className="muted small"> · {fmt(b.start)}</span>
                  <span className="pl-why">{why.join(' · ')}</span>
                </span>
              </button>
            ))}
          </Rail>

          <Rail title="Staff" count={staff.length} empty="No staff yet.">
            {staff.map((s) => {
              const off = selected ? staffOnHoliday(holidays, s.staff_id, selected.start, selected.end) : false
              return (
                <RailItem
                  key={s.staff_id} armed={armed?.type === 'staff' && armed.id === s.staff_id}
                  colour={s.color} disabled={!isAdmin}
                  onPick={() => setArmed({ type: 'staff', id: s.staff_id, label: s.name })}
                  onDragStart={(e) => startRailDrag({ type: 'staff', id: s.staff_id, label: s.name }, e)}
                  title={s.name} sub={off ? 'on holiday for the open course' : (s.room || 'no room set')}
                  warn={off}
                />
              )
            })}
          </Rail>
        </div>
      </div>

      {selected && (
        <BlockPanel
          b={selected} staff={staff} holidays={holidays} isAdmin={isAdmin} busy={busy}
          onClose={() => setSelected(null)}
          onTrainer={(id) => place(selected.id, { type: 'staff', id, label: (staff.find((s) => String(s.staff_id) === String(id)) || {}).name || 'Trainer' })}
          onRemove={async (bookingId) => {
            setBusy(true)
            try { await returnToPool(bookingId); const f = await reload(); setSelected(f.find((x) => x.id === selected.id) || null); toast('Returned to the waiting list') }
            catch (e) { toast(e.message) } finally { setBusy(false) }
          }}
          go={go}
        />
      )}
    </div>
  )
}

/* ── The date ruler: months always, days once there is room ──────────────── */
function Ruler({ span, pxDay, xOf }) {
  const months = []
  let d = span.from.slice(0, 8) + '01'
  while (d <= span.to) {
    const next = iso(Date.UTC(new Date(d + 'T00:00:00Z').getUTCFullYear(), new Date(d + 'T00:00:00Z').getUTCMonth() + 1, 1))
    months.push({ d, w: (daysBetween(d < span.from ? span.from : d, next > span.to ? span.to : next)) * pxDay, label: MONTHS[new Date(d + 'T00:00:00Z').getUTCMonth()] + ' ' + new Date(d + 'T00:00:00Z').getUTCFullYear() })
    d = next
  }
  const days = []
  if (pxDay >= 18) for (let i = 0; i < span.days; i++) days.push(addDays(span.from, i))
  return (
    <div className="pl-ruler">
      <div className="pl-months">
        {months.map((m) => <div key={m.d} className="pl-month" style={{ width: Math.max(0, m.w) }}>{m.label}</div>)}
      </div>
      {days.length > 0 && (
        <div className="pl-days">
          {days.map((dd) => (
            <div key={dd} className={'pl-day' + (isWeekend(dd) ? ' wknd' : '') + (dd === todayISO() ? ' today' : '')} style={{ width: pxDay }}>
              {pxDay >= 34 ? new Date(dd + 'T00:00:00Z').getUTCDate() : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Weekend shading + today line ─────────────────────────────────────────
   Weekends are a repeating background rather than one element per day: at year
   zoom that would be hundreds of nodes per row for no visual gain. */
function weekendBg(span, pxDay) {
  const dow0 = new Date(span.from + 'T00:00:00Z').getUTCDay()   // 0 Sun … 6 Sat
  const toSaturday = (6 - dow0 + 7) % 7
  return {
    backgroundImage: `repeating-linear-gradient(90deg,#f7f9fc 0 ${2 * pxDay}px,transparent ${2 * pxDay}px ${7 * pxDay}px)`,
    backgroundPosition: `${toSaturday * pxDay}px 0`,
  }
}
function Grid({ span, pxDay, xOf }) {
  return <div className="pl-today" style={{ left: xOf(todayISO()) }} />
}

/* ── A course block ──────────────────────────────────────────────────────── */
function Bar({ b, lane, x, w, showLabels, isAdmin, armed, isTarget, flash, onOpen, onDrag }) {
  const cls = ['pl-bar']
  if (isTarget) cls.push('target')
  if (flash) cls.push('flash')
  if (armed) cls.push('armable')
  if (!b.ready) cls.push('incomplete')
  return (
    <div
      className={cls.join(' ')}
      data-id={b.id}
      style={{ left: x, width: w, top: lane * (ROW_H + LANE_GAP) + 3, height: ROW_H, background: b.color || 'var(--slate)' }}
      onClick={onOpen}
      title={`${b.course} · ${fmt(b.start)} – ${fmt(b.end)}\n${b.trainer || 'no trainer'} · ${b.delegates.length} delegate${b.delegates.length === 1 ? '' : 's'}`}
    >
      {isAdmin && <span className="pl-grip l" onPointerDown={(e) => onDrag(e, 'move')} />}
      {showLabels && (
        <span className="pl-bar-txt">
          {b.course}
          {b.delegates.length > 0 && <span className="pl-n">{b.delegates.length}</span>}
          {!b.trainerId && <span className="pl-flag">no trainer</span>}
        </span>
      )}
      {isAdmin && <span className="pl-grip r" onPointerDown={(e) => onDrag(e, 'resize')} />}
    </div>
  )
}

/* ── Rail plumbing ───────────────────────────────────────────────────────── */
function Rail({ title, count, empty, tone, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className={'card pl-railcard' + (tone === 'warn' && count ? ' warn' : '')} style={{ marginBottom: 12 }}>
      <h3 className="card-toggle" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <span className="chev">{open ? '▾' : '▸'}</span>{title}
        <span className="tag">{count}</span>
      </h3>
      {open && <div className="body">{count === 0 ? <div className="muted small">{empty}</div> : children}</div>}
    </div>
  )
}

function RailItem({ title, sub, colour, armed, warn, disabled, onPick, onDragStart }) {
  return (
    <button
      className={'pl-item' + (armed ? ' armed' : '') + (warn ? ' warn' : '')}
      disabled={disabled}
      onPointerDown={disabled ? undefined : onDragStart}
      onClick={disabled ? undefined : onPick}
      title={disabled ? 'Admins only' : 'Tap to pick up, then tap a course — or drag it across'}
    >
      <span className="pl-item-c" style={{ background: colour || 'var(--slate)' }} />
      <span className="pl-item-t"><b>{title}</b><span className="muted small">{sub}</span></span>
      {armed && <span className="pl-item-go">tap a course →</span>}
    </button>
  )
}

/* ── Block detail ────────────────────────────────────────────────────────── */
function BlockPanel({ b, staff, holidays, isAdmin, busy, onClose, onTrainer, onRemove, go }) {
  return (
    <div className="pl-panel-wrap" onClick={onClose}>
      <aside className="pl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pl-panel-head" style={{ borderTopColor: b.color || 'var(--slate)' }}>
          <div>
            <h3 style={{ margin: 0, padding: 0, border: 0 }}>{b.course}</h3>
            <div className="muted small">{fmt(b.start)} – {fmt(b.end)} · {b.scheme || '—'}</div>
          </div>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>
        <div className="body">
          <div className="field">
            <label className="fl">Trainer</label>
            {isAdmin ? (
              <select value={b.trainerId || ''} disabled={busy} onChange={(e) => onTrainer(e.target.value)}>
                <option value="">— none yet —</option>
                {staff.map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>
                    {s.name}{staffOnHoliday(holidays, s.staff_id, b.start, b.end) ? ' (on holiday)' : ''}
                  </option>
                ))}
              </select>
            ) : <div className="muted small">{b.trainer || '—'}</div>}
          </div>

          <div className="field">
            <label className="fl">On this course ({b.delegates.length})</label>
            {b.delegates.length === 0
              ? <div className="muted small">Nobody yet — pick someone from the waiting list and tap this course.</div>
              : (
                <ul className="pl-delg">
                  {b.delegates.map((d) => (
                    <li key={d.bookingId}>
                      <span className="pl-item-c" style={{ background: kindColour(d.kind) }} />
                      <span><b>{d.name}</b>{d.codes?.length ? <span className="muted small"> · {d.codes.join(', ')}</span> : null}</span>
                      {isAdmin && <button className="linkbtn" disabled={busy} onClick={() => onRemove(d.bookingId)}>remove</button>}
                    </li>
                  ))}
                </ul>
              )}
          </div>

          {!b.ready && <div className="hint">This course still needs {!b.trainerId ? 'a trainer' : ''}{!b.trainerId && !b.delegates.length ? ' and ' : ''}{!b.delegates.length ? 'at least one delegate' : ''}.</div>}
          {go && <button className="btn ghost sm" onClick={() => { onClose(); go('sched') }}>Open in Schedule →</button>}
        </div>
      </aside>
    </div>
  )
}
