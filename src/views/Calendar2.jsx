import { useEffect, useMemo, useState, useCallback } from 'react'
import { Calendar as RBCalendar, dayjsLocalizer, Views } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import dayjs from 'dayjs'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import { listBlocks, listCourses, listStaff, createBlock, updateBlock } from '../lib/api.js'
import { toast } from '../lib/toast.js'

/* ----------------------------------------------------------------------------
 * SGAS Calendar 2 — react-big-calendar (MIT). Google/Outlook-style month / week
 * / day / agenda over the same blocks as Calendar 1, so the two can be A/B'd.
 * Drag-select to create, drag to move, edge-drag to resize, click to open.
 * Colours come from eventPropGetter (runs every render → always up to date).
 * -------------------------------------------------------------------------- */

const localizer = dayjsLocalizer(dayjs)
const DnDCalendar = withDragAndDrop(RBCalendar)
const PREFS_KEY = 'sgas_cal2_prefs'

function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} } }
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ } }
const iso = (d) => dayjs(d).format('YYYY-MM-DD')
const todayISO = () => dayjs().format('YYYY-MM-DD')

export default function Calendar2({ go }) {
  const saved = loadPrefs()
  const [view, setView] = useState(saved.view || Views.MONTH)
  const [date, setDate] = useState(new Date())
  const [scheme, setScheme] = useState(saved.scheme || '')
  const [staffFilter, setStaffFilter] = useState(saved.staffFilter || '')
  const [colourBy, setColourBy] = useState(saved.colourBy || 'course')
  const [showFinished, setShowFinished] = useState(saved.showFinished ?? true)

  const [blocks, setBlocks] = useState(null)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [openBlock, setOpenBlock] = useState(null)
  const [creating, setCreating] = useState(null)

  const refresh = useCallback(async () => {
    const [b, c, s] = await Promise.all([listBlocks(), listCourses(), listStaff()])
    setBlocks(b); setCourses(c); setStaff(s)
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { savePrefs({ view, scheme, staffFilter, colourBy, showFinished }) }, [view, scheme, staffFilter, colourBy, showFinished])

  const schemes = useMemo(() => [...new Set((courses || []).map((c) => c.scheme).filter(Boolean))].sort(), [courses])

  const filtered = useMemo(() => {
    let list = blocks || []
    if (scheme) list = list.filter((b) => b.scheme === scheme)
    if (staffFilter) list = list.filter((b) => String(b.trainerId) === staffFilter)
    if (!showFinished) list = list.filter((b) => !b.end || b.end >= todayISO())
    return list
  }, [blocks, scheme, staffFilter, showFinished])

  function colourFor(b) {
    if (colourBy === 'status') return b.ready ? '#1f9d55' : '#b7791f'
    return b.color || '#48566a'
  }

  // rbc all-day events: end is EXCLUSIVE, so add a day to our inclusive end_date.
  const events = useMemo(() => filtered.map((b) => ({
    id: b.id,
    title: `${b.course} · ${b.delegates.length}👤${b.ready ? '' : ' ⚠'}`,
    start: dayjs(b.start).toDate(),
    end: dayjs(b.end).add(1, 'day').toDate(),
    allDay: true,
    block: b,
  })), [filtered])

  const eventPropGetter = useCallback((event) => ({
    style: { backgroundColor: colourFor(event.block), borderColor: 'rgba(0,0,0,.18)', color: '#fff', borderRadius: 6 },
  }), [colourBy])

  async function persistMove({ event, start, end }) {
    const from = iso(start)
    let to = iso(dayjs(end).subtract(1, 'day')) // back off the exclusive end
    if (to < from) to = from
    try { await updateBlock(event.id, { from, to }); toast(`Block moved to ${from} – ${to}`); await refresh() }
    catch (e) { toast(e.message); await refresh() }
  }

  function onSelectSlot({ start, end }) {
    const from = iso(start)
    let to = iso(dayjs(end).subtract(1, 'day'))
    if (to < from) to = from
    setCreating({ from, to })
  }

  return (
    <div className="cal2-wrap">
      <div className="cal-toolbar">
        <div className="cal-filters" style={{ marginLeft: 0 }}>
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

      {blocks === null ? (
        <div className="loading">Loading calendar…</div>
      ) : (
        <div className="cal2-host">
          <DnDCalendar
            localizer={localizer}
            events={events}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            popup
            selectable
            resizable
            longPressThreshold={150}
            startAccessor="start"
            endAccessor="end"
            eventPropGetter={eventPropGetter}
            onSelectSlot={onSelectSlot}
            onSelectEvent={(e) => setOpenBlock(e.block)}
            onEventDrop={persistMove}
            onEventResize={persistMove}
            style={{ height: '72vh' }}
          />
        </div>
      )}

      <div className="leg">
        {[...new Map(filtered.map((b) => [b.course, b.color])).entries()].map(([course, color]) => (
          <span key={course}><i style={{ background: color || '#48566a' }}></i>{course}</span>
        ))}
      </div>

      {creating && <CreateModal range={creating} courses={courses} onClose={() => setCreating(null)} onCreated={async () => { setCreating(null); await refresh() }} />}
      {openBlock && <BlockDrawer b={openBlock} go={go} onClose={() => setOpenBlock(null)} />}
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
    try { await createBlock({ courseId: Number(courseId), from, to }); toast('Block created'); onCreated() }
    catch (e) { toast(e.message); setBusy(false) }
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
