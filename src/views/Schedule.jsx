import { useRef, useState } from 'react'
import { getPool, getReschedulePool, rescheduleDelegate, listBlocks, listStaff, listSessions, assignBlockRole, addDelegatesToBlock, pushBlockToTeamup, getBlockFormData, getFormData, ASSESSOR_COLOR } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials } from '../lib/util.js'
import { toast } from '../lib/toast.js'
import { downloadCombined, downloadZip, downloadForm } from '../lib/acspdf.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const todayISO = () => new Date().toISOString().slice(0, 10)
// Only the Trainer is assigned on the Schedule block — the Assessor and Verifier
// are now chosen in the Assess phase (per the review-meeting model change).
const ROLES = [['trainer', 'Trainer']]

// Booking-type colours for the waiting pool: green = new/full, blue = reassessment.
const KIND_COLOR = { NEW: '#1a8a4b', REASSESS: '#0a5ad6', MIXED: '#7b2ff2', NYC: '#b7791f', NO_SHOW: '#c0392b' }
const kindColor = (k) => KIND_COLOR[k] || '#48566a'
const KIND_LABEL = { NEW: 'New', REASSESS: 'Reassessment', MIXED: 'Mixed (new + reassessment)', NYC: 'NYC (not yet complete)', NO_SHOW: 'No-show' }
const kindLabel = (k) => KIND_LABEL[k] || 'New'
const kindTag = (k) => ({ REASSESS: 're', MIXED: 'mix', NYC: 'NYC', NO_SHOW: 'no-show' }[k] || '')
const DELEGATE_TYPES = [['NEW', 'New'], ['REASSESS', 'Reassessment'], ['MIXED', 'Mixed'], ['NYC', 'NYC'], ['NO_SHOW', 'No-show']]

// Preferred-date range for a waiting-pool delegate, if any.
const prefLabel = (p) => (p.prefFrom || p.prefTo) ? `${p.prefFrom ? fmt(p.prefFrom) : '…'} – ${p.prefTo ? fmt(p.prefTo) : '…'}` : null

// Download a single delegate's ACS form (used from a delegate chip in a block).
async function delForm(bookingId) {
  try {
    const d = await getFormData(bookingId)
    if (!d) return toast('No form data for this delegate')
    await downloadForm(d)
    toast('ACS form generated')
  } catch (e) { toast(e.message) }
}

// One delegate inside a block: coloured by kind (new/reassess/NYC/no-show),
// shows the course codes they're booked for, and the name prints their ACS form.
function DelegateChip({ d }) {
  const col = kindColor(d.kind)
  return (
    <div className="delg" style={{ borderLeft: `4px solid ${col}` }} title={kindLabel(d.kind)}>
      <span className="av" style={{ background: col, color: '#fff' }}>{initials(...d.name.split(' '))}</span>
      <a className="dn-link" onClick={(e) => { e.stopPropagation(); delForm(d.bookingId) }} title="Print this delegate's ACS form">{d.name}</a>
      {d.codes?.length > 0 && <span className="dcodes muted small">· {d.codes.join(', ')}</span>}
      {kindTag(d.kind) && <span className="b" style={{ marginLeft: 4, background: col, color: '#fff' }}>{kindTag(d.kind)}</span>}
    </div>
  )
}

export default function Schedule() {
  const [tab, setTab] = useState('menus')
  // Filters + per-block collapse state are lifted here so they persist across tabs.
  const [courseType, setCourseType] = useState('')   // '' = all course types (scheme)
  const [delegateType, setDelegateType] = useState('') // '' = all delegate types (kind)
  const [expanded, setExpanded] = useState(() => new Set()) // block ids that are open (collapsed by default)

  const f = {
    courseType, setCourseType, delegateType, setDelegateType,
    expanded,
    toggle: (id) => setExpanded((p) => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s }),
    expandAll: (ids) => setExpanded(new Set(ids)),
    collapseAll: () => setExpanded(new Set()),
  }

  return (
    <>
      <div className="hint">
        Course <b>blocks</b> (dates) are pulled in from <b>Teamup</b>. Assign a <b>Trainer</b>, <b>Assessor</b> and <b>Verifier</b> plus delegates to each. Two assignment styles below — try both and tell me which you prefer. <span className="tu">⟳ Teamup pull (stub)</span>
      </div>
      <div className="seg-tabs">
        <button className={'btn sm' + (tab === 'menus' ? '' : ' ghost')} onClick={() => setTab('menus')}>🧩 Menus</button>
        <button className={'btn sm' + (tab === 'drag' ? '' : ' ghost')} onClick={() => setTab('drag')}>🖐 Drag &amp; drop</button>
        <button className={'btn sm' + (tab === 'cal' ? '' : ' ghost')} onClick={() => setTab('cal')}>📅 Calendar</button>
      </div>
      {tab === 'menus' && <MenuAssign f={f} />}
      {tab === 'drag' && <DragAssign f={f} />}
      {tab === 'cal' && <CalendarTab f={f} />}
    </>
  )
}

// Distinct course types (schemes) present in a set of blocks/sessions.
const schemesOf = (rows) => [...new Set((rows || []).map((r) => r.scheme).filter(Boolean))].sort()

function FilterBar({ schemes, f, blockIds, showDelegate = true }) {
  const active = f.courseType || f.delegateType
  return (
    <div className="sched-filters">
      <label className="ff">Course type
        <select value={f.courseType} onChange={(e) => f.setCourseType(e.target.value)}>
          <option value="">All courses</option>
          {schemes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {showDelegate && (
        <label className="ff">Delegate type
          <select value={f.delegateType} onChange={(e) => f.setDelegateType(e.target.value)}>
            <option value="">All delegates</option>
            {DELEGATE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}
      {active && <button className="btn ghost sm" onClick={() => { f.setCourseType(''); f.setDelegateType('') }}>Clear</button>}
      <span className="ff-spacer"></span>
      {blockIds && (
        <>
          <button className="btn ghost sm" onClick={() => f.expandAll(blockIds)}>Expand all</button>
          <button className="btn ghost sm" onClick={f.collapseAll}>Collapse all</button>
        </>
      )}
    </div>
  )
}

// Section header for the assignment tabs — explains what the course-block area is for.
function SchedHeader() {
  return (
    <div className="sect-head">
      <h2>📚 Course blocks</h2>
      <p className="muted small">Each block is a course with its dates (pulled from Teamup). Assign the staff and delegates to each one, then push it back to Teamup. Use the filters to focus on a course or delegate type; click a block to open or collapse just that one.</p>
    </div>
  )
}

// Does a waiting-pool entry pass the delegate-type filter?
const passDelegate = (p, f) => !f.delegateType || (p.kind || 'NEW') === f.delegateType

/* ============================ STYLE A — dropdown menus ============================ */
function MenuAssign({ f }) {
  const { data: blocks, loading: l1, reload } = useData(listBlocks)
  const { data: staff, loading: l2 } = useData(listStaff)
  const { data: resched, reload: reloadResched } = useData(getReschedulePool)
  const [pool, setPool] = useState(() => getPool())
  const [picks, setPicks] = useState({})

  if (l1 || l2) return <div className="loading">Loading blocks…</div>
  if (!blocks.length) return <div className="empty card" style={{ padding: 40 }}>No course blocks yet. These come from Teamup once connected.</div>

  const schemes = schemesOf(blocks)
  const visible = f.courseType ? blocks.filter((b) => b.scheme === f.courseType) : blocks

  async function setRole(blockId, role, value) {
    await assignBlockRole(blockId, role, value ? Number(value) : null)
    reload()
  }
  function togglePick(blockId, poolId) {
    setPicks((prev) => {
      const set = new Set(prev[blockId] || [])
      set.has(poolId) ? set.delete(poolId) : set.add(poolId)
      return { ...prev, [blockId]: set }
    })
  }
  async function addDelegates(blockId) {
    const ids = [...(picks[blockId] || [])]
    if (!ids.length) return toast('Pick at least one delegate to add')
    const drafts = ids.filter((id) => !String(id).startsWith('rb-'))
    const rebooks = ids.filter((id) => String(id).startsWith('rb-'))
    let n = 0
    if (drafts.length) n += await addDelegatesToBlock(blockId, drafts)
    for (const rid of rebooks) {
      const item = (resched || []).find((p) => p.id === rid)
      if (item) { await rescheduleDelegate(item.bookingId, blockId); n++ }
    }
    toast(`Added ${n} delegate(s) to the block`)
    setPicks((p) => ({ ...p, [blockId]: new Set() }))
    setPool(getPool()); reloadResched(); reload()
  }

  return (
    <>
      <SchedHeader />
      <FilterBar schemes={schemes} f={f} blockIds={visible.map((b) => b.id)} />
      {visible.length === 0 && <div className="empty card" style={{ padding: 30 }}>No course blocks match the filter.</div>}
      <div className="course-grid">
        {visible.map((b) => {
          const open = f.expanded.has(b.id)
          const poolForScheme = [...pool, ...(resched || [])].filter((p) => p.scheme === b.scheme && passDelegate(p, f))
          const chosen = picks[b.id] || new Set()
          return (
            <div className={'ccard' + (open ? '' : ' collapsed')} key={b.id}>
              <BlockHeader b={b} open={open} onToggle={() => f.toggle(b.id)} />
              {open && (
                <>
                  <div className="cbd">
                    {ROLES.map(([role, label]) => (
                      <div className="field" key={role} style={{ marginBottom: 8 }}>
                        <label className="fl">{label}</label>
                        <select value={b[role + 'Id'] || ''} onChange={(e) => setRole(b.id, role, e.target.value)}>
                          <option value="">— choose {label.toLowerCase()} —</option>
                          {staff.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.name}{s.room ? ' · ' + s.room : ''}</option>)}
                        </select>
                      </div>
                    ))}
                    <BlockDelegates b={b} />
                    {poolForScheme.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div className="fl">Add from pool ({b.scheme}{f.delegateType ? ' · ' + kindLabel(f.delegateType) : ''})</div>
                        {poolForScheme.map((p) => (
                          <div className="delg" key={p.id} onClick={() => togglePick(b.id, p.id)} style={{ borderLeft: `4px solid ${kindColor(p.kind)}` }} title={kindLabel(p.kind)}>
                            <span className="av" style={{ background: kindColor(p.kind), color: '#fff' }}>{initials(p.forename, p.surname)}</span>{p.name}
                            {(p.kind === 'NYC' || p.kind === 'NO_SHOW') && <span className="b" style={{ marginLeft: 4, background: kindColor(p.kind), color: '#fff' }}>{kindTag(p.kind)}</span>}
                            {p.mlp && <span className="b scheme" style={{ marginLeft: 4 }}>MLP</span>}
                            {p.igas && <span className="b scheme">IGAS</span>}
                            <span className="muted small">{p.count} quals</span>
                            {prefLabel(p) && <span className="muted small" title="Preferred dates">📅 {prefLabel(p)}</span>}
                            <input type="checkbox" readOnly checked={chosen.has(p.id)} />
                          </div>
                        ))}
                        <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => addDelegates(b.id)}>Add selected</button>
                      </div>
                    )}
                  </div>
                  <BlockFooter b={b} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ============================ STYLE B — drag & drop ============================ */
function DragAssign({ f }) {
  const { data: blocks, loading: l1, reload } = useData(listBlocks)
  const { data: staff, loading: l2 } = useData(listStaff)
  const { data: resched, reload: reloadResched } = useData(getReschedulePool)
  const [pool, setPool] = useState(() => getPool())
  const drag = useRef(null)           // { type:'staff'|'delegate', id }
  const [sel, setSel] = useState(null) // click-to-place selection
  const [over, setOver] = useState(null)

  if (l1 || l2) return <div className="loading">Loading blocks…</div>
  if (!blocks.length) return <div className="empty card" style={{ padding: 40 }}>No course blocks yet. These come from Teamup once connected.</div>

  const schemes = schemesOf(blocks)
  const visible = f.courseType ? blocks.filter((b) => b.scheme === f.courseType) : blocks
  const allWaiting = [...pool, ...(resched || [])]
  const waiting = allWaiting.filter((p) => (!f.courseType || p.scheme === f.courseType) && passDelegate(p, f))

  async function assignRole(blockId, role, staffId) {
    await assignBlockRole(blockId, role, staffId); reload()
  }
  async function addDelegate(blockId, poolItem) {
    const blk = blocks.find((b) => b.id === blockId)
    if (blk?.scheme && poolItem.scheme && poolItem.scheme !== blk.scheme) {
      return toast(`${poolItem.name} booked ${poolItem.scheme}, not this course`)
    }
    if (String(poolItem.id).startsWith('rb-')) await rescheduleDelegate(poolItem.bookingId, blockId)
    else await addDelegatesToBlock(blockId, [poolItem.id])
    toast(`Added ${poolItem.name}${poolItem.origin ? ' (' + kindLabel(poolItem.origin) + ')' : ''}`)
    setPool(getPool()); reloadResched(); reload()
  }
  // Staff drop onto a specific role slot. Delegates fall through to the whole card.
  function onDropRole(e, blockId, role) {
    const d = drag.current
    if (d?.type === 'staff') { e.preventDefault(); setOver(null); assignRole(blockId, role, d.id); drag.current = null }
  }
  // Delegate drop ANYWHERE on the card.
  function onDropDelegate(e, blockId) {
    const d = drag.current
    if (d?.type === 'delegate') {
      e.preventDefault(); setOver(null)
      const item = allWaiting.find((p) => p.id === d.id)
      if (item) addDelegate(blockId, item)
      drag.current = null
    }
  }
  function clickZoneRole(blockId, role) {
    if (sel?.type === 'staff') assignRole(blockId, role, sel.id)
  }
  function clickCardDelegate(blockId) {
    if (sel?.type === 'delegate') {
      const item = allWaiting.find((p) => p.id === sel.id)
      if (item) addDelegate(blockId, item)
    }
  }

  return (
    <>
      <SchedHeader />
      <FilterBar schemes={schemes} f={f} blockIds={visible.map((b) => b.id)} />
      <div className="asr-pool">
        <span className="lbl">Staff — drag to a role, or click then click a slot</span>
        {staff.map((s) => {
          const on = sel?.type === 'staff' && sel.id === s.staff_id
          return (
            <span key={s.staff_id} className="asr-chip" style={{ background: s.color, outline: on ? '3px solid #0d1b2e' : 'none', outlineOffset: 2 }}
              draggable
              onDragStart={(e) => { drag.current = { type: 'staff', id: s.staff_id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'staff') }}
              onDragEnd={() => { drag.current = null }}
              onClick={() => setSel(on ? null : { type: 'staff', id: s.staff_id })}>
              {on ? '✓ ' : '👤 '}{s.name}
            </span>
          )
        })}
      </div>
      <div className="asr-pool">
        <span className="lbl">Delegates waiting{f.courseType || f.delegateType ? ' (filtered)' : ''} — drag onto a block card, or click then click a card
          <span className="kind-legend"><i style={{ background: KIND_COLOR.NEW }}></i>New <i style={{ background: KIND_COLOR.REASSESS }}></i>Reassessment <i style={{ background: KIND_COLOR.MIXED }}></i>Mixed <i style={{ background: KIND_COLOR.NYC }}></i>NYC <i style={{ background: KIND_COLOR.NO_SHOW }}></i>No-show</span>
        </span>
        {waiting.length === 0 && <span className="muted small">{allWaiting.length ? 'No waiting delegates match the filter.' : 'Pool empty — book delegates in “Book a Delegate”.'}</span>}
        {waiting.map((p) => {
          const on = sel?.type === 'delegate' && sel.id === p.id
          return (
            <span key={p.id} className="asr-chip" style={{ background: kindColor(p.kind), outline: on ? '3px solid #0d1b2e' : 'none', outlineOffset: 2 }}
              draggable title={kindLabel(p.kind)}
              onDragStart={(e) => { drag.current = { type: 'delegate', id: p.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'delegate') }}
              onDragEnd={() => { drag.current = null }}
              onClick={() => setSel(on ? null : { type: 'delegate', id: p.id })}>
              {on ? '✓ ' : ''}{p.name} <span className="rm">· {p.scheme || '—'}{kindTag(p.kind) ? ' · ' + kindTag(p.kind) : ''}{prefLabel(p) ? ' · 📅 ' + prefLabel(p) : ''}</span>
            </span>
          )
        })}
      </div>

      {visible.length === 0 && <div className="empty card" style={{ padding: 30 }}>No course blocks match the filter.</div>}
      <div className="course-grid">
        {visible.map((b) => {
          const open = f.expanded.has(b.id)
          const dropping = over === 'card:' + b.id || sel?.type === 'delegate'
          return (
            <div className={'ccard' + (open ? '' : ' collapsed') + (dropping ? ' droptarget' : '')} key={b.id}
              onDragOver={(e) => { if (drag.current?.type === 'delegate') { e.preventDefault(); setOver('card:' + b.id) } }}
              onDragLeave={() => setOver((o) => (o === 'card:' + b.id ? null : o))}
              onDrop={(e) => onDropDelegate(e, b.id)}>
              <BlockHeader b={b} open={open} onToggle={() => f.toggle(b.id)} />
              {open && (
                <>
                  <div className="cbd" style={{ cursor: sel?.type === 'delegate' ? 'pointer' : 'default' }} onClick={() => clickCardDelegate(b.id)}>
                    {ROLES.map(([role, label]) => {
                      const sid = b[role + 'Id']
                      const okey = `${b.id}:${role}`
                      return (
                        <div key={role} style={{ marginBottom: 8 }}>
                          <div className="fl">{label}</div>
                          <div className={'asr-drop' + (sid ? ' set' : '') + (over === okey || (!sid && sel?.type === 'staff') ? ' over' : '')}
                            style={{ cursor: !sid && sel?.type === 'staff' ? 'pointer' : 'default' }}
                            onClick={(e) => { e.stopPropagation(); clickZoneRole(b.id, role) }}
                            onDragOver={(e) => { e.preventDefault(); if (drag.current?.type === 'staff') setOver(okey) }}
                            onDrop={(e) => onDropRole(e, b.id, role)}>
                            {sid ? (
                              <>
                                <span className="dot" style={{ background: ASSESSOR_COLOR[sid] || '#48566a' }}></span>
                                <b>{b[role]}</b>
                                <span className="x" onClick={(e) => { e.stopPropagation(); assignRole(b.id, role, null) }}>✕</span>
                              </>
                            ) : (sel?.type === 'staff' ? `Click to place ${label.toLowerCase()}` : `Drop ${label.toLowerCase()} here`)}
                          </div>
                        </div>
                      )
                    })}

                    <div className="fl" style={{ marginTop: 10 }}>Delegates ({b.delegates.length})</div>
                    {b.delegates.map((d) => <DelegateChip d={d} key={d.bookingId} />)}
                    <div className="drop-hint muted small">
                      {sel?.type === 'delegate' ? '➕ Click anywhere on this card to add the selected delegate' : '⬇ Drag a delegate anywhere onto this card'}
                    </div>
                  </div>
                  <BlockFooter b={b} />
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ============================ shared block bits ============================ */
function BlockHeader({ b, open, onToggle }) {
  return (
    <div className="cth" onClick={onToggle} style={{ cursor: 'pointer' }} title={open ? 'Collapse' : 'Expand'}>
      <span className="chev">{open ? '▾' : '▸'}</span>
      <span className="cth-title">📚 {b.course}</span>
      <span className="cth-right">
        {!open && (
          <span className="cth-sum">
            {b.delegates.length}👤
            {b.ready ? <span className="b pass">Ready</span> : <span className="b pend">Incomplete</span>}
          </span>
        )}
        <span className="ct">{b.designator || b.scheme}</span>
      </span>
    </div>
  )
}
function BlockDelegates({ b }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="fl">Delegates on this block ({b.delegates.length})</div>
      {b.delegates.length === 0 && <div className="muted small" style={{ padding: '4px 0' }}>None yet.</div>}
      {b.delegates.map((d) => <DelegateChip d={d} key={d.bookingId} />)}
    </div>
  )
}
function BlockFooter({ b }) {
  const hasDelegates = b.delegates.length > 0
  async function push() {
    const r = await pushBlockToTeamup(b.id)
    toast(`⟳ ${r.course}: would push to ${r.targets.join(', ') || 'no staff yet'}. ${r.note}`)
  }
  async function forms(zip) {
    try {
      const data = await getBlockFormData(b.id)
      if (!data.length) return toast('No delegates on this block')
      const label = `${b.course}_${fmt(b.start)}`
      if (zip) await downloadZip(data, label)
      else await downloadCombined(data, label)
      toast(`${data.length} ACS form${data.length > 1 ? 's' : ''} generated${zip ? ' (zip)' : ''}`)
    } catch (e) { toast(e.message) }
  }
  return (
    <>
      <div className="cbd" style={{ paddingTop: 0 }}>
        <div className="muted small">
          {fmt(b.start)} – {fmt(b.end)} {b.ready
            ? <span className="b pass" style={{ marginLeft: 6 }}>Ready</span>
            : <span className="b pend" style={{ marginLeft: 6 }}>Incomplete</span>}
        </div>
      </div>
      <div className="cfoot">
        <button className="btn" style={{ width: '100%' }} disabled={!b.ready} onClick={push}>
          {b.ready ? 'Push to Teamup ⟳' : 'Assign a trainer + a delegate'}
        </button>
        <div className="form-row">
          <button className="btn-form" disabled={!hasDelegates} onClick={() => forms(false)} title="Batch-print one combined ACS form PDF for every delegate on this block">📄 Print ACS forms</button>
          <button className="btn-form ghost" disabled={!hasDelegates} onClick={() => forms(true)} title="Download one PDF per delegate as a zip">🗂 Zip</button>
        </div>
      </div>
    </>
  )
}

/* ============================ calendar ============================ */
function CalendarTab({ f }) {
  const { data: sessions, loading } = useData(listSessions)
  const { data: staff } = useData(listStaff)
  if (loading || !sessions) return <div className="loading">Loading calendar…</div>
  const schemes = schemesOf(sessions)
  const filtered = f.courseType ? sessions.filter((s) => s.scheme === f.courseType) : sessions
  return (
    <>
      <FilterBar schemes={schemes} f={f} showDelegate={false} />
      <Calendar sessions={filtered} staff={staff || []} />
    </>
  )
}

function Calendar({ sessions, staff }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7
  const dim = new Date(year, month + 1, 0).getDate()
  const today = todayISO()

  const cells = []
  ;['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((d) => cells.push(<div className="dow" key={'h' + d}>{d}</div>))
  for (let i = 0; i < startDow; i++) cells.push(<div className="day out" key={'o' + i}></div>)
  for (let dd = 1; dd <= dim; dd++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    const todays = sessions.filter((s) => dateStr >= s.start_date && dateStr <= s.end_date)
    cells.push(
      <div className={'day' + (dateStr === today ? ' today' : '')} key={'d' + dd}>
        <div className="dn">{dd}</div>
        {todays.map((s) => {
          const start = dateStr === s.start_date
          return <span className="chip" key={s.session_id} style={{ background: s.color }} title={`${s.course} · ${s.assessor || 'unassigned'}`}>
            {start ? `${s.course}${s.assessor ? ' · ' + s.assessor.split(' ').pop() : ''}` : '· · ·'}
          </span>
        })}
      </div>
    )
  }

  function move(n) {
    let m = month + n, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  return (
    <div>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => move(-1)}>‹</button>
        <div className="mt">{MONTHS[month]} {year}</div>
        <button className="cal-nav" onClick={() => move(1)}>›</button>
      </div>
      <div className="cal">{cells}</div>
      <div className="leg">
        {staff.map((a) => <span key={a.staff_id}><i style={{ background: a.color }}></i>{a.name}{a.room ? ' · ' + a.room : ''}</span>)}
        <span className="tu">⟳ blocks come from Teamup</span>
      </div>
    </div>
  )
}
