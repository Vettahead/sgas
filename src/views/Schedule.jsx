import { useRef, useState } from 'react'
import { getPool, getReschedulePool, rescheduleDelegate, listBlocks, listStaff, listSessions, assignBlockRole, addDelegatesToBlock, pushBlockToTeamup, ASSESSOR_COLOR } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials } from '../lib/util.js'
import { toast } from '../lib/toast.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const todayISO = () => new Date().toISOString().slice(0, 10)
const ROLES = [['trainer', 'Trainer'], ['assessor', 'Assessor'], ['verifier', 'Verifier']]

// Booking-type colours for the waiting pool: green = new/full, blue = reassessment.
const KIND_COLOR = { NEW: '#1a8a4b', REASSESS: '#0a5ad6', NYC: '#b7791f', NO_SHOW: '#c0392b' }
const kindColor = (k) => KIND_COLOR[k] || '#48566a'
const KIND_LABEL = { NEW: 'New', REASSESS: 'Reassessment', NYC: 'NYC (not yet complete)', NO_SHOW: 'No-show' }
const kindLabel = (k) => KIND_LABEL[k] || 'New'
const kindTag = (k) => ({ REASSESS: 're', NYC: 'NYC', NO_SHOW: 'no-show' }[k] || '')

export default function Schedule() {
  const [tab, setTab] = useState('menus')
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
      {tab === 'menus' && <MenuAssign />}
      {tab === 'drag' && <DragAssign />}
      {tab === 'cal' && <CalendarTab />}
    </>
  )
}

/* ============================ STYLE A — dropdown menus ============================ */
function MenuAssign() {
  const { data: blocks, loading: l1, reload } = useData(listBlocks)
  const { data: staff, loading: l2 } = useData(listStaff)
  const { data: resched, reload: reloadResched } = useData(getReschedulePool)
  const [pool, setPool] = useState(() => getPool())
  const [picks, setPicks] = useState({})

  if (l1 || l2) return <div className="loading">Loading blocks…</div>
  if (!blocks.length) return <div className="empty card" style={{ padding: 40 }}>No course blocks yet. These come from Teamup once connected.</div>

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
    <div className="course-grid">
      {blocks.map((b) => {
        const poolForScheme = [...pool, ...(resched || [])].filter((p) => p.scheme === b.scheme)
        const chosen = picks[b.id] || new Set()
        return (
          <div className="ccard" key={b.id}>
            <BlockHeader b={b} />
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
                  <div className="fl">Add from pool ({b.scheme})</div>
                  {poolForScheme.map((p) => (
                    <div className="delg" key={p.id} onClick={() => togglePick(b.id, p.id)} style={{ borderLeft: `4px solid ${kindColor(p.kind)}` }} title={kindLabel(p.kind)}>
                      <span className="av" style={{ background: kindColor(p.kind), color: '#fff' }}>{initials(p.forename, p.surname)}</span>{p.name}
                      {(p.kind === 'NYC' || p.kind === 'NO_SHOW') && <span className="b" style={{ marginLeft: 4, background: kindColor(p.kind), color: '#fff' }}>{kindTag(p.kind)}</span>}
                      {p.mlp && <span className="b scheme" style={{ marginLeft: 4 }}>MLP</span>}
                      {p.igas && <span className="b scheme">IGAS</span>}
                      <span className="muted small">{p.count} quals</span>
                      <input type="checkbox" readOnly checked={chosen.has(p.id)} />
                    </div>
                  ))}
                  <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => addDelegates(b.id)}>Add selected</button>
                </div>
              )}
            </div>
            <BlockFooter b={b} />
          </div>
        )
      })}
    </div>
  )
}

/* ============================ STYLE B — drag & drop ============================ */
function DragAssign() {
  const { data: blocks, loading: l1, reload } = useData(listBlocks)
  const { data: staff, loading: l2 } = useData(listStaff)
  const { data: resched, reload: reloadResched } = useData(getReschedulePool)
  const [pool, setPool] = useState(() => getPool())
  const drag = useRef(null)           // { type:'staff'|'delegate', id, scheme? }
  const [sel, setSel] = useState(null) // click-to-place selection
  const [over, setOver] = useState(null)
  const waiting = [...pool, ...(resched || [])]

  if (l1 || l2) return <div className="loading">Loading blocks…</div>
  if (!blocks.length) return <div className="empty card" style={{ padding: 40 }}>No course blocks yet. These come from Teamup once connected.</div>

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
  function onDropRole(e, blockId, role) {
    e.preventDefault(); setOver(null)
    const d = drag.current
    if (d?.type === 'staff') assignRole(blockId, role, d.id)
    drag.current = null
  }
  function onDropDelegate(e, blockId) {
    e.preventDefault(); setOver(null)
    const d = drag.current
    if (d?.type === 'delegate') {
      const item = waiting.find((p) => p.id === d.id)
      if (item) addDelegate(blockId, item)
    }
    drag.current = null
  }
  function clickZoneRole(blockId, role) {
    if (sel?.type === 'staff') assignRole(blockId, role, sel.id)
  }
  function clickZoneDelegate(blockId) {
    if (sel?.type === 'delegate') {
      const item = waiting.find((p) => p.id === sel.id)
      if (item) addDelegate(blockId, item)
    }
  }

  return (
    <>
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
        <span className="lbl">Delegates waiting — drag to a block, or click then click a block
          <span className="kind-legend"><i style={{ background: KIND_COLOR.NEW }}></i>New <i style={{ background: KIND_COLOR.REASSESS }}></i>Reassessment <i style={{ background: KIND_COLOR.NYC }}></i>NYC <i style={{ background: KIND_COLOR.NO_SHOW }}></i>No-show</span>
        </span>
        {waiting.length === 0 && <span className="muted small">Pool empty — book delegates in “Book a Delegate”.</span>}
        {waiting.map((p) => {
          const on = sel?.type === 'delegate' && sel.id === p.id
          return (
            <span key={p.id} className="asr-chip" style={{ background: kindColor(p.kind), outline: on ? '3px solid #0d1b2e' : 'none', outlineOffset: 2 }}
              draggable title={kindLabel(p.kind)}
              onDragStart={(e) => { drag.current = { type: 'delegate', id: p.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'delegate') }}
              onDragEnd={() => { drag.current = null }}
              onClick={() => setSel(on ? null : { type: 'delegate', id: p.id })}>
              {on ? '✓ ' : ''}{p.name} <span className="rm">· {p.scheme || '—'}{kindTag(p.kind) ? ' · ' + kindTag(p.kind) : ''}</span>
            </span>
          )
        })}
      </div>

      <div className="course-grid">
        {blocks.map((b) => (
          <div className="ccard" key={b.id}>
            <BlockHeader b={b} />
            <div className="cbd">
              {ROLES.map(([role, label]) => {
                const sid = b[role + 'Id']
                const okey = `${b.id}:${role}`
                return (
                  <div key={role} style={{ marginBottom: 8 }}>
                    <div className="fl">{label}</div>
                    <div className={'asr-drop' + (sid ? ' set' : '') + (over === okey || (!sid && sel?.type === 'staff') ? ' over' : '')}
                      style={{ cursor: !sid && sel?.type === 'staff' ? 'pointer' : 'default' }}
                      onClick={() => clickZoneRole(b.id, role)}
                      onDragOver={(e) => { e.preventDefault(); setOver(okey) }}
                      onDragLeave={() => setOver(null)}
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
              {b.delegates.map((d) => (
                <div className="delg" key={d.bookingId}><span className="av">{initials(...d.name.split(' '))}</span>{d.name}</div>
              ))}
              <div className={'asr-drop' + (over === `${b.id}:del` || sel?.type === 'delegate' ? ' over' : '')}
                style={{ marginTop: 6, cursor: sel?.type === 'delegate' ? 'pointer' : 'default' }}
                onClick={() => clickZoneDelegate(b.id)}
                onDragOver={(e) => { e.preventDefault(); setOver(`${b.id}:del`) }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => onDropDelegate(e, b.id)}>
                {sel?.type === 'delegate' ? 'Click to add the selected delegate' : 'Drop a delegate here'}
              </div>
            </div>
            <BlockFooter b={b} />
          </div>
        ))}
      </div>
    </>
  )
}

/* ============================ shared block bits ============================ */
function BlockHeader({ b }) {
  return (
    <div className="cth">📚 {b.course}<span className="ct">{b.designator || b.scheme}</span></div>
  )
}
function BlockDelegates({ b }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="fl">Delegates on this block ({b.delegates.length})</div>
      {b.delegates.length === 0 && <div className="muted small" style={{ padding: '4px 0' }}>None yet.</div>}
      {b.delegates.map((d) => (
        <div className="delg" key={d.bookingId}><span className="av">{initials(...d.name.split(' '))}</span>{d.name}</div>
      ))}
    </div>
  )
}
function BlockFooter({ b }) {
  async function push() {
    const r = await pushBlockToTeamup(b.id)
    toast(`⟳ ${r.course}: would push to ${r.targets.join(', ') || 'no staff yet'}. ${r.note}`)
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
          {b.ready ? 'Push to Teamup ⟳' : 'Assign all 3 roles + a delegate'}
        </button>
      </div>
    </>
  )
}

/* ============================ calendar ============================ */
function CalendarTab() {
  const { data: sessions, loading } = useData(listSessions)
  const { data: staff } = useData(listStaff)
  if (loading || !sessions) return <div className="loading">Loading calendar…</div>
  return <Calendar sessions={sessions} staff={staff || []} />
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
