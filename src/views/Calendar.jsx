import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPilot, DayPilotMonth, DayPilotCalendar } from '@daypilot/daypilot-lite-react'
import { listBlocks, listCourses, listStaff, createBlock, updateBlock } from '../lib/api.js'
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

export default function Calendar({ go }) {
  const saved = loadPrefs()
  const [view, setView] = useState(saved.view || 'Month')
  const [scheme, setScheme] = useState(saved.scheme || '')
  const [colourBy, setColourBy] = useState(saved.colourBy || 'course') // course | scheme | status
  const [showFinished, setShowFinished] = useState(saved.showFinished ?? true)
  const [staffFilter, setStaffFilter] = useState(saved.staffFilter || '')
  const [anchor, setAnchor] = useState(new DayPilot.Date(todayISO()))

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
  useEffect(() => { savePrefs({ view, scheme, colourBy, showFinished, staffFilter }) }, [view, scheme, colourBy, showFinished, staffFilter])

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

  // Resource lanes = one column per trainer (+ an Unassigned lane), single day.
  const rescolumns = useMemo(() => {
    const used = new Set(filtered.map((b) => b.trainerId || 'none'))
    const cols = staff.filter((s) => used.has(s.staff_id ?? s.id)).map((s) => ({ id: s.staff_id ?? s.id, name: s.name }))
    if (used.has('none')) cols.push({ id: 'none', name: 'Unassigned' })
    return cols.length ? cols : [{ id: 'none', name: 'Unassigned' }]
  }, [filtered, staff])

  function move(dir) {
    const map = { Month: 'months', Week: 'days', Day: 'days', Resources: 'days' }
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
          onEventClick={(args) => setOpenBlock(args.e.data.block)}
        />
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
        <BlockDrawer b={openBlock} go={go} onClose={() => setOpenBlock(null)} />
      )}
    </div>
  )
}

function CalToolbar({ view, setView, move, anchor, setAnchor, schemes, scheme, setScheme, staff, staffFilter, setStaffFilter, colourBy, setColourBy, showFinished, setShowFinished }) {
  const label = view === 'Month'
    ? anchor.toString('MMMM yyyy')
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
