import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPilot, DayPilotMonth, DayPilotCalendar } from '@daypilot/daypilot-lite-react'
import { listBlocks, listCourses, listStaff, listCategories, createBlock, updateBlock, deleteBlock, getPool, loadPool, assignBlockRole, addDelegatesToBlock, returnToPool, setBookingAttendance } from '../lib/api.js'
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
const ddmm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '')
// Kind colours (new vs reassessment etc.) for the Teamup-style multicolour bar.
const KCOL = { NEW: '#1f9d55', REASSESS: '#2f6fd0', NYC: '#b7791f', NO_SHOW: '#c0392b' }
const KIND_LABEL = { NEW: 'Full', REASSESS: 'Re', MIXED: 'Mixed', NYC: 'NYC', NO_SHOW: 'No-show' }
const kindColour = (k) => k === 'MIXED' ? '#7b2ff2' : (KCOL[k] || '#1f9d55')
function blockBackground(b, base) {
  const cols = []
  for (const d of b.delegates || []) {
    if (d.kind === 'MIXED') { cols.push(KCOL.NEW, KCOL.REASSESS) }
    else if (KCOL[d.kind]) cols.push(KCOL[d.kind])
  }
  const uniq = [...new Set(cols)]
  if (uniq.length > 1) {
    // hard-stop segments = multicolour bar (a 'mixed course')
    const seg = uniq.map((c, i) => `${c} ${Math.round((i / uniq.length) * 100)}% ${Math.round(((i + 1) / uniq.length) * 100)}%`).join(', ')
    return `linear-gradient(90deg, ${seg})`
  }
  return base
}

export default function Calendar({ go, isAdmin }) {
  const saved = loadPrefs()
  const [view, setView] = useState(saved.view || 'Month')
  const [selSchemes, setSelSchemes] = useState(() => new Set(saved.schemes || []))
  const [colourBy, setColourBy] = useState(saved.colourBy || 'course') // course | scheme | status
  const [showFinished, setShowFinished] = useState(saved.showFinished ?? true)
  const [selStaff, setSelStaff] = useState(() => new Set(saved.staffIds || []))
  const [anchor, setAnchor] = useState(new DayPilot.Date(todayISO()))
  const [numMonths, setNumMonths] = useState(saved.numMonths || 12)

  const [blocks, setBlocks] = useState(null)
  const [courses, setCourses] = useState([])
  const [staff, setStaff] = useState([])
  const [openBlock, setOpenBlock] = useState(null)
  const [pendingBlock, setPendingBlock] = useState(null) // admin: choosing view vs edit
  const [panelMode, setPanelMode] = useState('view')
  const [creating, setCreating] = useState(null) // { from, to } while the create modal is open
  const [pool, setPool] = useState([])
  const [categories, setCategories] = useState([])

  const calRef = useRef(null)
  const monthRef = useRef(null)

  async function refresh() {
    const [b, c, s, cats] = await Promise.all([listBlocks(), listCourses(), listStaff(), listCategories()])
    try { await loadPool() } catch { /* pool optional */ }
    setBlocks(b); setCourses(c); setStaff(s); setCategories(cats); setPool(getPool())
    return b
  }
  // Refresh data but keep the right panel open on the (now-updated) same block.
  async function refreshKeepOpen() {
    const b = await refresh()
    setOpenBlock((prev) => (prev ? b.find((x) => x.id === prev.id) || null : null))
  }
  useEffect(() => { refresh() }, [])

  // Admins get a Staff-view / Edit-view chooser; everyone else opens read-only.
  function openBlk(b) {
    if (isAdmin) { setPendingBlock(b) }
    else { setPanelMode('view'); setOpenBlock(b) }
  }
  useEffect(() => { savePrefs({ view, colourBy, showFinished, numMonths, schemes: [...selSchemes], staffIds: [...selStaff] }) }, [view, colourBy, showFinished, numMonths, selSchemes, selStaff])

  const schemes = useMemo(() => [...new Set((courses || []).map((c) => c.scheme).filter(Boolean))].sort(), [courses])

  // Apply the filters once; both the calendar AND the resource lanes use this.
  const filtered = useMemo(() => {
    let list = blocks || []
    if (selSchemes.size) list = list.filter((b) => selSchemes.has(b.scheme))
    if (selStaff.size) list = list.filter((b) => selStaff.has(String(b.trainerId)))
    if (!showFinished) list = list.filter((b) => !b.end || b.end >= todayISO())
    return list
  }, [blocks, selSchemes, selStaff, showFinished])

  function colourFor(b) {
    if (colourBy === 'status') return b.ready ? '#1f9d55' : '#b7791f'
    return b.color || '#48566a' // course colour is the default; scheme falls back to it too
  }
  const schemeColor = (sc) => (courses || []).find((c) => c.scheme === sc)?.color || '#9aa7b8'
  const toggleScheme = (sc) => setSelSchemes((x) => { const n = new Set(x); n.has(sc) ? n.delete(sc) : n.add(sc); return n })
  const toggleStaff = (id) => setSelStaff((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearFilters = () => { setSelSchemes(new Set()); setSelStaff(new Set()) }

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
        schemes={schemes} selSchemes={selSchemes} toggleScheme={toggleScheme} schemeColor={schemeColor}
        staff={staff} selStaff={selStaff} toggleStaff={toggleStaff}
        colourBy={colourBy} setColourBy={setColourBy}
        showFinished={showFinished} setShowFinished={setShowFinished}
        numMonths={numMonths} setNumMonths={setNumMonths} clearFilters={clearFilters}
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
          onEventClick={(args) => openBlk(args.e.data.block)}
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
          onEventClick={(args) => openBlk(args.e.data.block)}
        />
      ) : view === 'Year' ? (
        <YearView blocks={filtered} colourFor={colourFor} numMonths={numMonths} anchor={anchor}
          showStripes={colourBy === 'attendance'} onOpen={openBlk} onCreate={(from, to) => setCreating({ from, to })} />
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
          onEventClick={(args) => openBlk(args.e.data.block)}
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
      {pendingBlock && (
        <ViewChooser block={pendingBlock}
          onPick={(m) => { setPanelMode(m); setOpenBlock(pendingBlock); setPendingBlock(null) }}
          onClose={() => setPendingBlock(null)} />
      )}
      {openBlock && (
        <BlockDrawer b={openBlock} mode={panelMode} isAdmin={isAdmin} onSwitchMode={setPanelMode}
          courses={courses} staff={staff} pool={pool} categories={categories} go={go}
          onChanged={refreshKeepOpen} onClose={() => setOpenBlock(null)} />
      )}
    </div>
  )
}

function CalToolbar({ view, setView, move, anchor, setAnchor, schemes, selSchemes, toggleScheme, schemeColor, staff, selStaff, toggleStaff, colourBy, setColourBy, showFinished, setShowFinished, numMonths, setNumMonths, clearFilters }) {
  const label = (view === 'Month' || view === 'Year')
    ? anchor.toString('MMMM yyyy') + (view === 'Year' ? ' →' : '')
    : anchor.toString('d MMM yyyy')
  const anySel = selSchemes.size || selStaff.size
  return (
    <div className="cal-toolbar-wrap">
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
          <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} title="Colour blocks by">
            <option value="course">Colour: course</option>
            <option value="scheme">Colour: scheme</option>
            <option value="status">Colour: status</option>
            <option value="attendance">Colour: attendance</option>
          </select>
          <label className="cal-check"><input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} /> Finished</label>
        </div>
      </div>
      <div className="cal-chipbar">
        <div className="cal-chipgrp">
          <span className="cal-chiplabel">Schemes</span>
          {schemes.map((sc) => {
            const on = selSchemes.has(sc)
            return <span key={sc} className={'asr-chip cal-fchip' + (on ? ' on' : '')} style={{ background: schemeColor(sc) }} onClick={() => toggleScheme(sc)}>{on ? '✓ ' : ''}{sc}</span>
          })}
        </div>
        <div className="cal-chipgrp">
          <span className="cal-chiplabel">Staff</span>
          {(staff || []).map((st) => {
            const id = String(st.staff_id ?? st.id); const on = selStaff.has(id)
            return <span key={id} className={'asr-chip cal-fchip' + (on ? ' on' : '')} style={{ background: st.color || '#48566a' }} onClick={() => toggleStaff(id)}>{on ? '✓ ' : '👤 '}{st.name}</span>
          })}
        </div>
        {anySel ? <button className="btn ghost sm" onClick={clearFilters}>Clear</button> : null}
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

function ViewChooser({ block, onPick, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Open “{block.course}”</h3>
        <p className="muted small">How do you want to open this block?</p>
        <div className="chooser">
          <button className="chooser-opt" onClick={() => onPick('view')}>
            <span className="chooser-ic">👁</span><strong>Staff view</strong>
            <span className="muted small">Read-only — exactly what staff see</span>
          </button>
          <button className="chooser-opt" onClick={() => onPick('edit')}>
            <span className="chooser-ic">✏️</span><strong>Edit view</strong>
            <span className="muted small">Change dates, trainer and delegates</span>
          </button>
        </div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}

function AttendanceEdit({ d, block, busy, onSave }) {
  const full0 = !d.attendFrom && !d.attendTo
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(d.attendFrom || block.start)
  const [to, setTo] = useState(d.attendTo || block.end)
  if (!editing) {
    return (
      <span className="att-line">
        <span className={'att-tag ' + (full0 ? 'full' : 'part')}>{full0 ? '🗓 Full course' : 'Part · ' + ddmm(d.attendFrom) + '–' + ddmm(d.attendTo)}</span>
        <button className="att-change" onClick={() => setEditing(true)} disabled={busy}>Change</button>
      </span>
    )
  }
  function save() {
    if (from < block.start || to > block.end) return toast('Dates must be within the block (' + ddmm(block.start) + '–' + ddmm(block.end) + ')')
    if (from > to) return toast('From must be on or before To')
    // Leaving the dates at the full block span keeps it a full course (null/null).
    const isFull = from === block.start && to === block.end
    onSave(isFull ? null : from, isFull ? null : to)
    setEditing(false)
  }
  return (
    <span className="att-edit">
      <span className="att-dates">
        <input type="date" value={from} min={block.start} max={block.end} onChange={(e) => setFrom(e.target.value)} />
        <span>–</span>
        <input type="date" value={to} min={block.start} max={block.end} onChange={(e) => setTo(e.target.value)} />
      </span>
      <button className="att-change" onClick={save} disabled={busy}>Save</button>
      <button className="att-change" onClick={() => setEditing(false)} disabled={busy}>✕</button>
      <span className="muted att-hint">full span = full course</span>
    </span>
  )
}

function BlockDrawer({ b, courses, staff, pool, categories, mode, isAdmin, onSwitchMode, go, onChanged, onClose }) {
  const editing = isAdmin && mode === 'edit'
  const cur = (courses || []).find((c) => c.name === b.course)
  const [courseId, setCourseId] = useState(cur ? String(cur.course_id) : '')
  const [from, setFrom] = useState(b.start)
  const [to, setTo] = useState(b.end)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [openCats, setOpenCats] = useState(null)

  async function run(fn, okMsg) {
    setBusy(true)
    try { await fn(); if (okMsg) toast(okMsg); if (onChanged) await onChanged() }
    catch (e) { toast(e.message) }
    finally { setBusy(false) }
  }
  async function save() {
    if (from > to) return toast('Start must be on or before end')
    await run(() => updateBlock(b.id, { from, to, courseId: courseId ? Number(courseId) : undefined }), 'Block updated')
    onClose()
  }
  async function del() { await run(() => deleteBlock(b.id), 'Block deleted'); onClose() }
  const setTrainer = (id) => run(() => assignBlockRole(b.id, 'trainer', id ? Number(id) : null), 'Trainer updated')
  const addDelegate = (pid) => run(() => addDelegatesToBlock(b.id, [pid]), 'Delegate added')
  const removeDelegate = (bid) => run(() => returnToPool(bid), 'Returned to waiting pool')

  // Waiting pool grouped by SCHEME (same as the Schedule page).
  const gmap = new Map()
  for (const pe of pool || []) {
    const k = pe.scheme || 'Other'
    if (!gmap.has(k)) gmap.set(k, [])
    gmap.get(k).push(pe)
  }
  const groups = [...gmap.entries()].map(([scheme, items]) => ({ scheme, items }))
    .sort((a, z) => ((a.scheme === b.scheme ? 0 : 1) - (z.scheme === b.scheme ? 0 : 1)) || a.scheme.localeCompare(z.scheme))
  const openSet = openCats || new Set(groups.filter((g) => g.scheme === b.scheme).map((g) => g.scheme))
  const toggleCat = (k) => { const n = new Set(openSet); n.has(k) ? n.delete(k) : n.add(k); setOpenCats(n) }

  return (
    <div className="cal-rpanel-wrap">
      <div className="cal-rpanel-backdrop" onClick={onClose} />
      <aside className="cal-rpanel" onClick={(e) => e.stopPropagation()}>
        <div className="cal-rpanel-head" style={{ borderLeft: `5px solid ${b.color || '#48566a'}` }}>
          <div className="cal-rpanel-title"><h3>{b.course}</h3><button className="cal-x" onClick={onClose}>✕</button></div>
          <span className="muted small">{b.scheme || '—'} · {b.delegates.length} delegate(s)</span>
          {isAdmin && (
            <div className="cal-modeseg">
              <button className={mode === 'view' ? 'on' : ''} onClick={() => onSwitchMode('view')}>👁 Staff view</button>
              <button className={mode === 'edit' ? 'on' : ''} onClick={() => onSwitchMode('edit')}>✏️ Edit view</button>
            </div>
          )}
        </div>

        {editing && (
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
            <div className="cal-editbtns">
              <button className="btn sm" onClick={save} disabled={busy}>Save dates</button>
              {confirmDel
                ? <button className="btn sm danger" onClick={del} disabled={busy}>Confirm delete</button>
                : <button className="btn sm ghost" onClick={() => setConfirmDel(true)} disabled={busy}>Delete block</button>}
            </div>
          </div>
        )}

        <div className="cal-sec">
          <strong>Trainer</strong>
          {editing
            ? (
              <select value={b.trainerId || ''} onChange={(e) => setTrainer(e.target.value)} disabled={busy}>
                <option value="">— unassigned —</option>
                {(staff || []).map((s) => <option key={s.staff_id ?? s.id} value={s.staff_id ?? s.id}>{s.name}</option>)}
              </select>
            )
            : <div className="muted small">{b.trainer || '—'}{b.assessor ? ` · Assessor: ${b.assessor}` : ''}{b.verifier ? ` · Verifier: ${b.verifier}` : ''}</div>}
          {!b.ready && <div className="cal-warn small">⚠ needs a trainer and at least one delegate</div>}
        </div>

        <div className="cal-sec">
          <strong>On this block ({b.delegates.length})</strong>
          {b.delegates.length === 0 && <div className="muted small">No delegates yet.</div>}
          <ul className="cal-delg">
            {b.delegates.map((d) => {
              const full = !d.attendFrom && !d.attendTo
              return (
                <li key={d.bookingId}>
                  <span className="cal-delg-info">
                    <span>{d.name}{d.codes?.length ? <span className="muted"> · {d.codes.join(', ')}</span> : null} <span className="kindtag" style={{ background: kindColour(d.kind) }}>{KIND_LABEL[d.kind] || 'Full'}</span></span>
                    {editing
                      ? <AttendanceEdit d={d} block={b} busy={busy} onSave={(f, t) => run(() => setBookingAttendance(d.bookingId, f, t), 'Attendance updated')} />
                      : <span className={'att-tag ' + (full ? 'full' : 'part')}>{full ? 'Full course' : 'Part · ' + ddmm(d.attendFrom) + '–' + ddmm(d.attendTo)}</span>}
                  </span>
                  {editing && <button className="cal-mini" title="Return to waiting pool" onClick={() => removeDelegate(d.bookingId)} disabled={busy}>↩</button>}
                </li>
              )
            })}
          </ul>
        </div>

        {editing && (
          <div className="cal-sec">
            <strong>Waiting pool</strong>
            {groups.length === 0 && <div className="muted small">No one waiting.</div>}
            {groups.map((g) => (
              <div key={g.scheme} className={'pool-grp' + (openSet.has(g.scheme) ? ' open' : '')}>
                <button className="pool-grp-head" onClick={() => toggleCat(g.scheme)}>
                  <span className="chev">{openSet.has(g.scheme) ? '▾' : '▸'}</span>
                  <strong>{g.scheme}</strong>
                  <span className="pool-grp-n">{g.items.length}</span>
                </button>
                {openSet.has(g.scheme) && (
                  <ul className="cal-delg">
                    {g.items.map((pe) => (
                      <li key={pe.id}>
                        <span>{pe.name}{pe.count ? <span className="muted"> · {pe.count} qual(s)</span> : null}</span>
                        <button className="cal-mini add" title="Add to this block" onClick={() => addDelegate(pe.id)} disabled={busy}>＋</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="cal-rpanel-foot">
          {go && <button className="btn ghost sm" onClick={() => { onClose(); go('sched') }}>Full Schedule →</button>}
          <button className="btn sm" onClick={onClose}>Done</button>
        </div>
      </aside>
    </div>
  )
}

/* ============================ Year view ============================ */
/* Teamup-style: each month is a row, days are weekday-aligned columns, course
 * blocks are colour bars that stack into lanes. Drag across day cells to create. */
function YearView({ blocks, colourFor, numMonths, anchor, showStripes, onOpen, onCreate }) {
  const startY = Number(anchor.toString('yyyy'))
  const startM = Number(anchor.toString('MM')) - 1
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [hover, setHover] = useState(null)
  const onHover = (bk, e) => setHover({ b: bk, x: e.clientX, y: e.clientY })
  const onHoverEnd = () => setHover(null)

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
        <YMonthRow key={`${y}-${m}`} y={y} m={m} blocks={blocks} colourFor={colourFor} showStripes={showStripes} onOpen={onOpen}
          onHover={onHover} onHoverEnd={onHoverEnd}
          lo={lo} hi={hi}
          onCellDown={(d) => { setDragStart(d); setDragEnd(d) }}
          onCellEnter={(d) => { if (dragStart) setDragEnd(d) }} />
      ))}
      {hover && <HoverCard b={hover.b} x={hover.x} y={hover.y} />}
    </div>
  )
}

function HoverCard({ b, x, y }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = Math.min(x + 14, vw - 296)
  const top = Math.min(y + 14, vh - 240)
  return (
    <div className="yc-hover" style={{ left, top }}>
      <div className="yc-hover-head" style={{ borderLeft: `4px solid ${b.color || '#48566a'}` }}>
        <strong>{b.course}</strong>
        <span className="muted small">{b.scheme || '—'} · {b.start} – {b.end}</span>
      </div>
      <div className="yc-hover-roles small">
        <span>Trainer: {b.trainer || '—'}</span>
        <span>Assessor: {b.assessor || '—'}</span>
        <span>Verifier: {b.verifier || '—'}</span>
        <span className={b.ready ? 'ok' : 'warn'}>{b.ready ? '● Ready' : '● Incomplete'}</span>
      </div>
      <div className="yc-hover-delg small">
        <strong>Delegates ({b.delegates.length})</strong>
        {b.delegates.length === 0 && <div className="muted">None yet.</div>}
        {b.delegates.map((d) => {
          const full = !d.attendFrom && !d.attendTo
          return (
            <div key={d.bookingId} className="yc-hover-d">
              <span>{d.name}{d.codes?.length ? <span className="muted"> · {d.codes.join(', ')}</span> : null} <span className="kindtag" style={{ background: kindColour(d.kind) }}>{KIND_LABEL[d.kind] || 'Full'}</span></span>
              <span className={'att-tag ' + (full ? 'full' : 'part')}>{full ? 'Full' : 'Part ' + ddmm(d.attendFrom) + '–' + ddmm(d.attendTo)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function YMonthRow({ y, m, blocks, colourFor, showStripes, onOpen, onHover, onHoverEnd, lo, hi, onCellDown, onCellEnter }) {
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
    bars.push({ b, startCol: offset + sd - 1, endCol: offset + ed - 1, cs, ce })
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
  // always keep ONE extra empty lane at the bottom so you can drag-create a new
  // block even on a day that is already full of courses.
  const lanes = laneEnds.length + 1
  const todayCol = today.slice(0, 7) === first.slice(0, 7) ? offset + Number(today.slice(8, 10)) - 1 : -1

  return (
    <div className="yc-row">
      <div className="yc-mlabel">{YMONTHS[m]}<small>{y}</small></div>
      <div className="yc-track" style={{ gridTemplateColumns: `repeat(${YCOLS}, 1fr)`, gridTemplateRows: `22px repeat(${lanes}, 27px)` }}>
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
        {bars.map(({ b, startCol, endCol, lane, cs, ce }) => {
          const span = endCol - startCol + 1
          // each PARTIAL attendee striped over the days they actually attend
          const stripes = (showStripes ? (b.delegates || []) : []).filter((d) => d.attendFrom || d.attendTo).map((d) => {
            const ws = d.attendFrom || b.start, we = d.attendTo || b.end
            const wf = ws < cs ? cs : ws, wt = we > ce ? ce : we
            if (wt < wf) return null
            const sC = offset + Number(wf.slice(8, 10)) - 1
            const eC = offset + Number(wt.slice(8, 10)) - 1
            return { left: ((sC - startCol) / span) * 100, width: ((eC - sC + 1) / span) * 100 }
          }).filter(Boolean)
          return (
            <button key={b.id} className="yc-bar"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => onHover(b, e)}
              onMouseMove={(e) => onHover(b, e)}
              onMouseLeave={onHoverEnd}
              onClick={(e) => { e.stopPropagation(); onOpen(b) }}
              style={{ gridColumn: `${startCol + 1} / ${endCol + 2}`, gridRow: lane + 2, background: blockBackground(b, colourFor(b)) }}>
              {stripes.map((st, i) => <span key={i} className="yc-stripe" style={{ left: st.left + '%', width: st.width + '%' }} />)}
              <span className="yc-bar-t">{b.course} {b.delegates.length ? `· ${b.delegates.length}` : ''}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
