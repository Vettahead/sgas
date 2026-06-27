import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPilot, DayPilotMonth, DayPilotCalendar } from '@daypilot/daypilot-lite-react'
import { listBlocks, listCourses, listStaff, createBlock, updateBlock, deleteBlock } from '../lib/api.js'
import { toast } from '../lib/toast.js'

/* ----------------------------------------------------------------------------
 * SGAS Calendar — DayPilot Lite (Apache 2.0). Month / Week / Day / Resources
 * views over the real course blocks (listBlocks). Drag to create a block,
 * drag-move / resize to change its dates, click to open the roster.
 * Reused as a standalone nav tab AND inside the Schedule screen's Calendar tab.
 * -------------------------------------------------------------------------- */

const PREFS_KEY = 'sgas_cal_prefs'
const VIEWS = [
  { v: 'Month', label: 'Month' },
  { v: 'Week', label: 'Week' },
  { v: 'Day', label: 'Day' },
  { v: 'Resources', label: 'Staff lanes' },
  { v: 'Year', label: 'Year' },
]

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

const isoOf = (dp) => dp.toString('yyyy-MM-dd')
// DayPilot end is exclusive (next-day midnight) after a whole-day drag — pull it
// back to the last covered day so it maps to our inclusive end_date.
function endIso(dp) {
  const s = dp.toString('yyyy-MM-ddTHH:mm:ss')
  if (s.slice(11) === '00:00:00') return new DayPilot.Date(s.slice(0, 10)).addDays(-1).toString('yyyy-MM-dd')
  return s.slice(0, 10)
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const YMONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const YDOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const YCOLS = 37 // max columns to fit any month: weekday offset (0-6) + up to 31 days
const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export default function Calendar({ go }) {
  const saved = loadPrefs()
  const [view, setView] = useState(saved.view || 'Month')
  const [scheme, setScheme] = useState(saved.scheme || '')
  const [colourBy, setColourBy] = useState(saved.colourBy || 'course') // course | scheme | status
  const [showFinished, setShowFinished] = useState(saved.showFinished ?? true)
  const [staffFilter, setStaffFilter] = useState(saved.staffFilter || '')
  const [anchor, setAnchor] = useState(new DayPilot.Date(todayISO()))
  const [numMonths, setNumMonths] = useState(saved.numMonths || 12)

  const [blocks, setBlocks] = useState(null)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [openBlock, setOpenBlock] = useState(null)
  const [creating, setCreating] = useState(null) // { from, to } while the create modal is open

  const calRef = useRef(null)
  const monthRef = useRef(null)

  async function refresh() {
    const [b, c, s] = await Promise.all([listBlocks(), listCourses(), listStaff()])
    setBlocks(b); setCourses(c); setStaff(s)
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => { savePrefs({ view, scheme, colourBy, showFinished, staffFilter, numMonths }) }, [view, scheme, colourBy, showFinished, staffFilter, numMonths])

  const schemes = useMemo(() => [...new Set((courses || []).map((c) => c.scheme).filter(Boolean))].sort(), [courses])

  // Apply the filters once; both the calendar AND the resource lanes use this.
  const filtered = useMemo(() => {
    let list = blocks || []
    if (scheme) list = list.filter((b) => b.scheme === scheme)
    if (staffFilter) list = list.filter((b) => String(b.trainerId) === staffFilter)
    if (!showFinished) list = list.filter((b) => !b.end || b.end >= todayISO())
    return list
  }, [blocks, scheme, staffFilter, showFinished])

  function colourFor(b) {
    if (colourBy === 'status') return b.ready ? '#1f9d55' : '#b7791f'
    return b.color || '#48566a' // course colour is the default; scheme falls back to it too
  }

  // Block -> DayPilot event. All-day blocks are shown across 09:00–17:00 so they
  // read as a band in the time-grid (Week/Day) and as a bar in Month.
  const events = useMemo(() => (filtered).map((b) => ({
    id: b.id,
    text: `${b.course} · ${b.delegates.length}👤${b.ready ? '' : ' · ⚠'}`,
    start: `${b.start}T09:00:00`,
    end: `${b.end}T17:00:00`,
    backColor: colourFor(b),
    borderColor: 'darker',
    fontColor: '#fff',
    moveDisabled: !!(b.end && b.end < todayISO()),
    resizeDisabled: !!(b.end && b.end < todayISO()),
    resource: b.trainerId || 'none',
    block: b,
  })), [filtered, colourBy])

  // DayPilot reads event colours via onBeforeEventRender on EVERY render, so a
  // course-colour change (or a colour-by switch) always repaints. Setting
  // backColor on the event data alone does NOT refresh on prop updates.
  const renderEvent = (args) => {
    const b = args.data.block
    const c = b ? colourFor(b) : '#48566a'
    args.data.backColor = c
    args.data.barColor = c
    args.data.borderColor = 'darker'
    args.data.fontColor = '#fff'
  }

  // Resource lanes = one column per trainer (+ an Unassigned lane), single day.
  const rescolumns = useMemo(() => {
    const used = new Set(filtered.map((b) => b.trainerId || 'none'))
    const cols = staff.filter((s) => used.has(s.staff_id ?? s.id)).map((s) => ({ id: s.staff_id ?? s.id, name: s.name }))
    if (used.has('none')) cols.push({ id: 'none', name: 'Unassigned' })
    return cols.length ? cols : [{ id: 'none', name: 'Unassigned' }]
  }, [filtered, staff])

  function move(dir) {
    const map = { Month: 'months', Week: 'days', Day: 'days', Resources: 'days', Year: 'months' }
    const n = view === 'Week' ? 7 : view === 'Month' ? 1 : 1
    const unit = map[view]
    setAnchor((a) => (unit === 'months' ? a.addMonths(dir) : a.addDays(dir * n)))
  }

  async function doMoveResize(args) {
    const e = args.e
    const from = isoOf(args.newStart)
    const to = endIso(args.newEnd)
    try {
      await updateBlock(e.data.id, { from, to })
      toast(`Block moved to ${from} – ${to}`)
      await refresh()
    } catch (err) { toast(err.message); await refresh() }
  }

  return (
    <div className="cal-wrap">
      <CalToolbar
        view={view} setView={setView} move={move} anchor={anchor} setAnchor={setAnchor}
        schemes={schemes} scheme={scheme} setScheme={setScheme}
        staff={staff} staffFilter={staffFilter} setStaffFilter={setStaffFilter}
        colourBy={colourBy} setColourBy={setColourBy}
        showFinished={showFinished} setShowFinished={setShowFinished}
        numMonths={numMonths} setNumMonths={setNumMonths}
      />

      {blocks === null ? (
        <div className="loading">Loading calendar…</div>
      ) : view === 'Month' ? (
        <DayPilotMonth
          ref={monthRef}
          startDate={anchor}
          events={events}
          eventMoveHandling="Update"
          eventResizeHandling="Update"
          timeRangeSelectedHandling="Enabled"
          onTimeRangeSelected={(args) => { monthRef.current?.control.clearSelection(); setCreating({ from: isoOf(args.start), to: endIso(args.end) }) }}
          onEventMoved={doMoveResize}
          onEventResized={doMoveResize}
          onBeforeEventRender={renderEvent}
          onEventClick={(args) => setOpenBlock(args.e.data.block)}
        />
      ) : view === 'Resources' ? (
        <DayPilotCalendar
          ref={calRef}
          viewType="Resources"
          startDate={anchor}
          columns={rescolumns}
          events={events}
          businessBeginsHour={7}
          businessEndsHour={19}
          eventMoveHandling="Disabled"
          eventResizeHandling="Disabled"
          timeRangeSelectedHandling="Disabled"
          onBeforeEventRender={renderEvent}
          onEventClick={(args) => setOpenBlock(args.e.data.block)}
        />
      ) : view === 'Year' ? (
        <YearView blocks={filtered} colourFor={colourFor} numMonths={numMonths} anchor={anchor}
          onOpen={setOpenBlock} onCreate={(from, to) => setCreating({ from, to })} />
      ) : (
        <DayPilotCalendar
          ref={calRef}
          viewType={view}
          startDate={anchor}
          events={events}
          businessBeginsHour={7}
          businessEndsHour={19}
          eventMoveHandling="Update"
          eventResizeHandling="Update"
          timeRangeSelectedHandling="Enabled"
          onTimeRangeSelected={(args) => { calRef.current?.control.clearSelection(); setCreating({ from: isoOf(args.start), to: endIso(args.end) }) }}
          onEventMoved={doMoveResize}
          onEventResized={doMoveResize}
          onBeforeEventRender={renderEvent}
          onEventClick={(args) => setOpenBlock(args.e.data.block)}
        />
      )}

      <Legend blocks={filtered} colourBy={colourBy} />

      {creating && (
        <CreateModal
          range={creating} courses={courses}
          onClose={() => setCreating(null)}
          onCreated={async () => { setCreating(null); await refresh() }}
        />
      )}
      {openBlock && (
        <BlockDrawer b={openBlock} courses={courses} go={go}
          onChanged={refresh} onClose={() => setOpenBlock(null)} />
      )}
    </div>
  )
}

function CalToolbar({ view, setView, move, anchor, setAnchor, schemes, scheme, setScheme, staff, staffFilter, setStaffFilter, colourBy, setColourBy, showFinished, setShowFinished, numMonths, setNumMonths }) {
  const label = (view === 'Month' || view === 'Year')
    ? anchor.toString('MMMM yyyy') + (view === 'Year' ? ' →' : '')
    : anchor.toString('d MMM yyyy')
  return (
    <div className="cal-toolbar">
      <div className="cal-nav-grp">
        <button className="cal-nav" onClick={() => move(-1)}>‹</button>
        <button className="btn ghost sm" onClick={() => setAnchor(new DayPilot.Date(todayISO()))}>Today</button>
        <button className="cal-nav" onClick={() => move(1)}>›</button>
        <span className="cal-label">{label}</span>
      </div>
      <div className="cal-views">
        {VIEWS.map((x) => (
          <button key={x.v} className={'btn sm' + (view === x.v ? '' : ' ghost')} onClick={() => setView(x.v)}>{x.label}</button>
        ))}
      </div>
      <div className="cal-filters">
        {view === 'Year' && (
          <label className="yc-months">Months
            <select value={numMonths} onChange={(e) => setNumMonths(Number(e.target.value))}>
              {[3, 6, 9, 12, 18, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <select value={scheme} onChange={(e) => setScheme(e.target.value)}>
          <option value="">All schemes</option>
          {schemes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="">All trainers</option>
          {staff.map((s) => <option key={s.staff_id ?? s.id} value={String(s.staff_id ?? s.id)}>{s.name}</option>)}
        </select>
        <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} title="Colour blocks by">
          <option value="course">Colour: course</option>
          <option value="scheme">Colour: scheme</option>
          <option value="status">Colour: status</option>
        </select>
        <label className="cal-check"><input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> Finished</label>
      </div>
    </div>
  )
}

function Legend({ blocks, colourBy }) {
  if (colourBy === 'status') {
    return <div className="leg"><span><i style={{ background: '#1f9d55' }}></i>Ready</span><span><i style={{ background: '#b7791f' }}></i>Incomplete</span></div>
  }
  const pairs = [...new Map(blocks.map((b) => [b.course, b.color])).entries()]
  return (
    <div className="leg">
      {pairs.map(([course, color]) => <span key={course}><i style={{ background: color || '#48566a' }}></i>{course}</span>)}
      {pairs.length === 0 && <span className="muted small">No blocks in view.</span>}
    </div>
  )
}

function CreateModal({ range, courses, onClose, onCreated }) {
  const [courseId, setCourseId] = useState('')
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [busy, setBusy] = useState(false)
  async function save() {
    if (!courseId) return toast('Pick a course')
    if (from > to) return toast('Start must be on or before end')
    setBusy(true)
    try {
      await createBlock({ courseId: Number(courseId), from, to })
      toast('Block created'); onCreated()
    } catch (e) { toast(e.message); setBusy(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New block</h3>
        <p className="muted small">Drag created {from} → {to}. Pick the course and confirm.</p>
        <label className="fld">Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">— select —</option>
            {courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.name}{c.scheme ? ` (${c.scheme})` : ''}</option>)}
          </select>
        </label>
        <div className="cal-dates">
          <label className="fld">Start<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="fld">End<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create block'}</button>
        </div>
      </div>
    </div>
  )
}

function BlockDrawer({ b, courses, go, onChanged, onClose }) {
  const cur = (courses || []).find((c) => c.name === b.course)
  const [courseId, setCourseId] = useState(cur ? String(cur.course_id) : '')
  const [from, setFrom] = useState(b.start)
  const [to, setTo] = useState(b.end)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  async function save() {
    if (from > to) return toast('Start must be on or before end')
    setBusy(true)
    try {
      await updateBlock(b.id, { from, to, courseId: courseId ? Number(courseId) : undefined })
      toast('Block updated'); if (onChanged) await onChanged(); onClose()
    } catch (e) { toast(e.message); setBusy(false) }
  }
  async function del() {
    setBusy(true)
    try { await deleteBlock(b.id); toast('Block deleted'); if (onChanged) await onChanged(); onClose() }
    catch (e) { toast(e.message); setBusy(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cal-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cal-drawer-head" style={{ borderLeft: `5px solid ${b.color || '#48566a'}` }}>
          <h3>{b.course}</h3>
          <span className="muted small">{b.scheme || '—'} · {b.delegates.length} delegate(s)</span>
        </div>
        <div className="cal-edit">
          <label className="fld">Course
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {(courses || []).map((c) => <option key={c.course_id} value={c.course_id}>{c.name}{c.scheme ? ` (${c.scheme})` : ''}</option>)}
            </select>
          </label>
          <div className="cal-dates">
            <label className="fld">Start<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="fld">End<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
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
          {confirmDel ? (
            <>
              <span className="muted small" style={{ marginRight: 'auto' }}>Delete this block?</span>
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="btn danger" onClick={del} disabled={busy}>Delete</button>
            </>
          ) : (
            <>
              <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setConfirmDel(true)} disabled={busy}>Delete</button>
              {go && <button className="btn ghost" onClick={() => { onClose(); go('sched') }}>Schedule →</button>}
              <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================ Year view ============================ */
/* Teamup-style: each month is a row, days are weekday-aligned columns, course
 * blocks are colour bars that stack into lanes. Drag across day cells to create. */
function YearView({ blocks, colourFor, numMonths, anchor, onOpen, onCreate }) {
  const startY = Number(anchor.toString('yyyy'))
  const startM = Number(anchor.toString('MM')) - 1
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)

  const months = []
  let y = startY, m = startM
  for (let i = 0; i < numMonths; i++) { months.push({ y, m }); m++; if (m > 11) { m = 0; y++ } }

  const lo = dragStart && dragEnd ? (dragStart < dragEnd ? dragStart : dragEnd) : null
  const hi = dragStart && dragEnd ? (dragStart < dragEnd ? dragEnd : dragStart) : null

  function finish() {
    if (dragStart && dragEnd) {
      const a = dragStart < dragEnd ? dragStart : dragEnd
      const b = dragStart < dragEnd ? dragEnd : dragStart
      onCreate(a, b)
    }
    setDragStart(null); setDragEnd(null)
  }

  return (
    <div className="yc" onMouseUp={finish} onMouseLeave={() => { setDragStart(null); setDragEnd(null) }}>
      <div className="yc-head">
        <div className="yc-mlabel" />
        <div className="yc-dowrow">
          {Array.from({ length: YCOLS }, (_, c) => <div className="yc-dow" key={c}>{YDOW[c % 7]}</div>)}
        </div>
      </div>
      {months.map(({ y, m }) => (
        <YMonthRow key={`${y}-${m}`} y={y} m={m} blocks={blocks} colourFor={colourFor} onOpen={onOpen}
          lo={lo} hi={hi}
          onCellDown={(d) => { setDragStart(d); setDragEnd(d) }}
          onCellEnter={(d) => { if (dragStart) setDragEnd(d) }} />
      ))}
    </div>
  )
}

function YMonthRow({ y, m, blocks, colourFor, onOpen, lo, hi, onCellDown, onCellEnter }) {
  const dim = new Date(y, m + 1, 0).getDate()
  const offset = (new Date(y, m, 1).getDay() + 6) % 7
  const first = ymd(y, m, 1)
  const last = ymd(y, m, dim)
  const today = todayISO()

  const bars = []
  for (const b of blocks) {
    if (!b.start || !b.end) continue
    if (b.end < first || b.start > last) continue
    const cs = b.start < first ? first : b.start
    const ce = b.end > last ? last : b.end
    const sd = Number(cs.slice(8, 10)), ed = Number(ce.slice(8, 10))
    bars.push({ b, startCol: offset + sd - 1, endCol: offset + ed - 1 })
  }
  bars.sort((a, c) => a.startCol - c.startCol || a.endCol - c.endCol)
  const laneEnds = []
  for (const bar of bars) {
    let placed = false
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] < bar.startCol) { bar.lane = i; laneEnds[i] = bar.endCol; placed = true; break }
    }
    if (!placed) { bar.lane = laneEnds.length; laneEnds.push(bar.endCol) }
  }
  const lanes = laneEnds.length || 1
  const todayCol = today.slice(0, 7) === first.slice(0, 7) ? offset + Number(today.slice(8, 10)) - 1 : -1

  return (
    <div className="yc-row">
      <div className="yc-mlabel">{YMONTHS[m]}<small>{y}</small></div>
      <div className="yc-track" style={{ gridTemplateColumns: `repeat(${YCOLS}, 1fr)`, gridTemplateRows: `22px repeat(${lanes}, 28px)` }}>
        {Array.from({ length: YCOLS }, (_, c) => {
          const inMonth = c >= offset && c < offset + dim
          const day = c - offset + 1
          return <div key={'n' + c} className={'yc-num' + (inMonth ? '' : ' out') + (((c % 7) >= 5 && inMonth) ? ' wknd' : '')} style={{ gridColumn: c + 1, gridRow: 1 }}>{inMonth ? day : ''}</div>
        })}
        {Array.from({ length: YCOLS }, (_, c) => {
          const inMonth = c >= offset && c < offset + dim
          const day = c - offset + 1
          const dateStr = inMonth ? ymd(y, m, day) : null
          const isToday = dateStr === today
          const isWknd = (c % 7) >= 5
          const sel = dateStr && lo && hi && dateStr >= lo && dateStr <= hi
          return (
            <div key={'c' + c}
              className={'yc-cell' + (inMonth ? '' : ' out') + (isWknd && inMonth ? ' wknd' : '') + (isToday ? ' today' : '') + (sel ? ' sel' : '')}
              style={{ gridColumn: c + 1, gridRow: `2 / span ${lanes}` }}
              onMouseDown={inMonth ? () => onCellDown(dateStr) : undefined}
              onMouseEnter={inMonth ? () => onCellEnter(dateStr) : undefined} />
          )
        })}
        {todayCol >= 0 && <div className="yc-todaybar" style={{ gridColumn: todayCol + 1, gridRow: `1 / span ${lanes + 1}` }} />}
        {bars.map(({ b, startCol, endCol, lane }) => (
          <button key={b.id} className="yc-bar" title={`${b.course} · ${b.start}–${b.end} · ${b.delegates.length} delegate(s)`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpen(b) }}
            style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 2, background: colourFor(b) }}>
            <span className="yc-bar-t">{b.course} {b.delegates.length ? `· ${b.delegates.length}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
