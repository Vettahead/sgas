import { useState, useRef } from 'react'
import { DayPilot, DayPilotMonth } from '@daypilot/daypilot-lite-react'
import { getDashboard, listBlocks, recordRenewalContact, getRenewalContacts, RENEWAL_COLD_THRESHOLD } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { roleLabel } from '../lib/roles.js'
import { toast } from '../lib/toast.js'

const WINDOWS = [[90, '3 months'], [180, '6 months'], [270, '9 months'], [365, '12 months']]
const CALL_OUTCOMES = ['No reply', 'Left voicemail', 'Will call back', 'Booked in', 'Not interested']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// The dashboard is modular: each module can be shown/hidden/reordered per user.
// `roles` = which roles may use the module (and the default set they get).
const MODULES = [
  { id: 'stats', title: 'Overview tiles', roles: ['ADMIN', 'STANDARD', 'SCHEDULER', 'ASSESSOR', 'ACCOUNTS'] },
  { id: 'calendar', title: '📅 Your month at a glance', roles: ['ADMIN', 'STANDARD', 'SCHEDULER', 'ASSESSOR'] },
  { id: 'renewals', title: '🔔 Renewal engine', roles: ['ADMIN', 'STANDARD'] },
  { id: 'cold', title: '📞 Cold list', roles: ['ADMIN', 'STANDARD'] },
  { id: 'scheduling', title: '🗓 Blocks awaiting assignment', roles: ['ADMIN', 'SCHEDULER'] },
  { id: 'assessment', title: '✅ Blocks to assess', roles: ['ADMIN', 'ASSESSOR'] },
  { id: 'outstanding', title: '💷 Outstanding to chase', roles: ['ADMIN', 'STANDARD', 'ACCOUNTS'] },
  { id: 'mlps', title: '🎓 Managed Learning Programmes', roles: ['ADMIN', 'STANDARD'] },
]

const OPEN_KEY = 'sgas_dash_open'
const layoutKey = (role) => 'sgas_dash_layout_' + role
const loadSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')) } catch { return new Set() } }
const defaultLayout = (role) => MODULES.filter((m) => m.roles.includes(role)).map((m) => m.id)
function loadLayout(role) {
  try { const v = JSON.parse(localStorage.getItem(layoutKey(role))); return Array.isArray(v) ? v : defaultLayout(role) } catch { return defaultLayout(role) }
}
const saveLayout = (role, ids) => { try { localStorage.setItem(layoutKey(role), JSON.stringify(ids)) } catch { /* ignore */ } }
const widthsKey = (role) => 'sgas_dash_w_' + role
const loadWidths = (role) => { try { return JSON.parse(localStorage.getItem(widthsKey(role))) || {} } catch { return {} } }
const saveWidths = (role, w) => { try { localStorage.setItem(widthsKey(role), JSON.stringify(w)) } catch { /* ignore */ } }

export default function Dashboard({ go, user }) {
  const [windowDays, setWindowDays] = useState(180)
  const { data, loading, reload } = useData(() => getDashboard({ windowDays }), [windowDays])
  const [callTarget, setCallTarget] = useState(null)
  const [openLog, setOpenLog] = useState(null)
  const [blockMonth, setBlockMonth] = useState('')
  const [openCards, setOpenCards] = useState(() => loadSet(OPEN_KEY))
  const role = user?.role || 'ADMIN'
  const [layout, setLayout] = useState(() => loadLayout(role))
  const [widths, setWidths] = useState(() => loadWidths(role))
  const modsRef = useRef(null)
  const [customise, setCustomise] = useState(false)
  if (loading || !data) return <div className="loading">Loading dashboard…</div>

  const { renewals, coldList, chase, counts, mlps, awaitingBlocks, assessBlocks } = data
  const windowLabel = (WINDOWS.find(([d]) => d === windowDays) || [, windowDays + ' days'])[1]

  const isOpen = (id) => openCards.has(id)
  const toggleCard = (id) => setOpenCards((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id)
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
    return s
  })

  const STAT = {
    renew: [counts.renew, `Expiring within ${windowLabel}`, 'amber'],
    sessions: [counts.sessions, 'Scheduled sessions', 'brand'],
    outstanding: [counts.outstanding, 'Payments outstanding', 'green'],
    unassigned: [counts.unassigned, 'Blocks awaiting assignment', 'amber'],
    toAssess: [counts.toAssess, 'Delegates to assess', 'brand'],
    cold: [counts.cold, 'On the cold list (phone)', 'green'],
  }
  const STAT_KEYS = {
    ADMIN: ['renew', 'sessions', 'unassigned', 'toAssess', 'outstanding'],
    STANDARD: ['renew', 'sessions', 'outstanding'],
    SCHEDULER: ['unassigned', 'sessions', 'renew'],
    ASSESSOR: ['toAssess', 'sessions', 'unassigned'],
    ACCOUNTS: ['outstanding', 'cold', 'renew'],
  }
  const statKeys = STAT_KEYS[role] || STAT_KEYS.ADMIN
  const logKey = (r) => `${r.clientId}:${r.code}`

  const monthKey = (iso) => (iso ? iso.slice(0, 7) : '')
  const monthName = (key) => { const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  const blockMonths = [...new Set((awaitingBlocks || []).map((b) => monthKey(b.start)).filter(Boolean))].sort()
  const shownAwaiting = blockMonth ? (awaitingBlocks || []).filter((b) => monthKey(b.start) === blockMonth) : (awaitingBlocks || [])

  async function emailRenewal(r) {
    await recordRenewalContact(r.clientId, r.code, 'email')
    const subject = `Renewal due: your ${r.code} certification`
    const body =
      `Hi ${r.name},\n\n` +
      `Our records show your ${r.code} (${r.desc}) is due to expire on ${fmt(r.expiry)}.\n` +
      `To stay qualified, please book your reassessment with us before then.\n\n` +
      `Reply to this email or call the centre and we'll get you booked in.\n\n` +
      `Specialist Gas Assessment Services`
    if (r.email) window.location.href = `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    toast(`Renewal email logged for ${r.name} (${r.code})${r.email ? '' : ' — no email on file'}`)
    reload()
  }
  async function saveCall(notes) {
    const r = callTarget
    await recordRenewalContact(r.clientId, r.code, 'phone', notes)
    toast(`Call logged for ${r.name} (${r.code})${notes ? ': ' + notes : ''}`)
    setCallTarget(null)
    reload()
  }
  const toggleLog = (r) => { const k = logKey(r); setOpenLog((cur) => (cur === k ? null : k)) }

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const Actions = ({ r }) => (
    <span className="renew-actions">
      <button className="btn ghost sm" onClick={() => emailRenewal(r)} title="Send an individualised renewal email">✉ Email</button>
      <button className="btn ghost sm" onClick={() => setCallTarget(r)} title="Log a phone call and what was said">📞 Call</button>
      <button className="btn ghost sm" onClick={() => toggleLog(r)} title="View the contact history">Log</button>
    </span>
  )
  const ContactBadge = ({ r }) => (
    r.contacts > 0
      ? <span className="muted small" title={r.lastContact ? 'Last contact: ' + fmt(r.lastContact) : ''}>{r.emails}✉{r.calls > 0 ? ' · ' + r.calls + '📞' : ''}</span>
      : <span className="muted small">—</span>
  )

  // --- module layout (per-user, role-scoped) ---
  const allowed = new Set(MODULES.filter((m) => m.roles.includes(role)).map((m) => m.id))
  const visible = layout.filter((id) => allowed.has(id))
  const hidden = MODULES.filter((m) => allowed.has(m.id) && !visible.includes(m.id))
  const persist = (ids) => { setLayout(ids); saveLayout(role, ids) }
  const move = (id, dir) => { const i = visible.indexOf(id), j = i + dir; if (j < 0 || j >= visible.length) return; const a = [...visible]; [a[i], a[j]] = [a[j], a[i]]; persist(a) }
  const removeMod = (id) => persist(visible.filter((x) => x !== id))
  const addMod = (id) => persist([...visible, id])
  function startResize(id, e) {
    e.preventDefault()
    const cw = modsRef.current ? modsRef.current.clientWidth : 1000
    const startX = e.clientX
    const startPct = widths[id] || 100
    const onMove = (ev) => {
      const pct = Math.max(25, Math.min(100, Math.round(startPct + ((ev.clientX - startX) / cw) * 100)))
      setWidths((w) => ({ ...w, [id]: pct }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setWidths((w) => { saveWidths(role, w); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  const resetLayout = () => { persist(defaultLayout(role)); setWidths({}); saveWidths(role, {}) }

  const ctx = {
    go, user, isOpen, toggleCard, renewals, coldList, chase, mlps, counts, STAT, statKeys,
    windowDays, setWindowDays, windowLabel, logKey, openLog, Actions, ContactBadge,
    blockMonth, setBlockMonth, blockMonths, monthName, shownAwaiting, awaitingBlocks, assessBlocks,
  }

  return (
    <>
      <div className="dash-greet">
        👋 {greet}{user?.name ? ', ' + user.name : ''} <span className="role-chip">{roleLabel(role)}</span>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setCustomise((c) => !c)}>{customise ? '✓ Done' : '⚙ Customise'}</button>
      </div>

      {customise && (
        <div className="dash-customise">
          <span className="muted small">Add a module:</span>
          {hidden.length === 0
            ? <span className="muted small">All your modules are shown.</span>
            : hidden.map((m) => <button key={m.id} className="btn ghost sm" onClick={() => addMod(m.id)}>＋ {m.title}</button>)}
          <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={resetLayout}>Reset to default</button>
        </div>
      )}

      <div className="dash-mods" ref={modsRef}>
        {visible.map((id) => {
          const mod = MODULES.find((m) => m.id === id)
          if (!mod) return null
          const pct = widths[id] || 100
          return (
            <div className="dash-mod" key={id} style={{ flex: '0 0 calc(' + pct + '% - 9px)' }}>
              {customise && (
                <div className="dash-mod-bar">
                  <span className="dash-mod-name">{mod.title}</span>
                  <button className="btn ghost sm" onClick={() => move(id, -1)} title="Move up">↑</button>
                  <button className="btn ghost sm" onClick={() => move(id, 1)} title="Move down">↓</button>
                  <button className="btn ghost sm" onClick={() => removeMod(id)} title="Remove">✕</button>
                </div>
              )}
              {renderModule(id, ctx)}
              <span className="dash-grip" onMouseDown={(e) => startResize(id, e)} title="Drag to resize" />
            </div>
          )
        })}
      </div>

      {callTarget && <CallModal target={callTarget} onSave={saveCall} onClose={() => setCallTarget(null)} />}
    </>
  )
}

function renderModule(id, c) {
  if (id === 'stats') {
    return (
      <div className="stat-row">
        {c.statKeys.map((k) => {
          const [n, l, cls] = c.STAT[k]
          return <div className="card" key={k}><div className={'body stat ' + cls}><div className="n">{n}</div><div className="l">{l}</div></div></div>
        })}
      </div>
    )
  }
  if (id === 'calendar') {
    return (
      <DashCard id="calendar" title="📅 Your month at a glance" open={c.isOpen('calendar')} onToggle={c.toggleCard}>
        <MonthGlance go={c.go} user={c.user} />
      </DashCard>
    )
  }
  if (id === 'renewals') {
    const { renewals, isOpen, toggleCard, windowDays, setWindowDays, logKey, openLog, Actions, ContactBadge, go } = c
    return (
      <DashCard id="renewals" title="🔔 Renewal engine — expiring soon" badge="nightly scan" count={renewals.length} open={isOpen('renewals')} onToggle={toggleCard}>
        <div className="body" style={{ paddingBottom: 0 }}>
          <label className="renew-window">Look ahead:&nbsp;
            <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
              {WINDOWS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
            </select>
          </label>
          <span className="muted small" style={{ marginLeft: 10 }}>Booked-in delegates drop off automatically; contact one at a time.</span>
        </div>
        <table>
          <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th>In</th><th style={{ textAlign: 'center' }}>Contacts</th><th>Actions</th></tr></thead>
          <tbody>
            {renewals.length === 0 && <tr><td colSpan={6} className="empty">Nothing expiring in the window</td></tr>}
            {renewals.map((r) => (
              <RenewalRows key={logKey(r)} r={r} cols={6} open={openLog === logKey(r)} Actions={Actions} ContactBadge={ContactBadge}
                lead={<>
                  <td className="nowrap">{fmt(r.expiry)}</td>
                  <td><span className={'b ' + (r.days <= 90 ? 'due' : 'scheme')}>{r.days} days</span></td>
                </>} go={go} />
            ))}
          </tbody>
        </table>
        <div className="banner">Cross-references qualification expiry against the look-ahead window. A delegate already booked for their renewal drops off the list; if they don't attend, they reappear. Every email and call is individualised and logged (GDPR — no bulk sends).</div>
      </DashCard>
    )
  }
  if (id === 'cold') {
    const { coldList, isOpen, toggleCard, logKey, openLog, Actions, ContactBadge, go } = c
    return (
      <DashCard id="cold" title="📞 Cold list — phone follow-up" badge={`${coldList.length} after ${RENEWAL_COLD_THRESHOLD}+ emails`} count={coldList.length} open={isOpen('cold')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th style={{ textAlign: 'center' }}>Contacts</th><th>Mobile</th><th>Actions</th></tr></thead>
          <tbody>
            {coldList.length === 0 && <tr><td colSpan={6} className="empty">No one on the cold list</td></tr>}
            {coldList.map((r) => (
              <RenewalRows key={logKey(r)} r={r} cols={6} open={openLog === logKey(r)} Actions={Actions} ContactBadge={ContactBadge}
                lead={<td className="nowrap">{fmt(r.expiry)}</td>}
                tail={<td className="nowrap">{r.mobile || '—'}</td>} go={go} />
            ))}
          </tbody>
        </table>
        <div className="banner">These delegates haven't answered {RENEWAL_COLD_THRESHOLD} or more renewal emails — work them by phone. Use <b>Log call</b> to record what was said.</div>
      </DashCard>
    )
  }
  if (id === 'scheduling') {
    const { isOpen, toggleCard, blockMonth, setBlockMonth, blockMonths, monthName, shownAwaiting, awaitingBlocks, go } = c
    return (
      <DashCard id="scheduling" title="🗓 Blocks awaiting assignment" badge={blockMonth ? `${shownAwaiting.length} of ${awaitingBlocks.length}` : awaitingBlocks.length} open={isOpen('scheduling')} onToggle={toggleCard}>
        {blockMonths.length > 1 && (
          <div className="body" style={{ paddingBottom: 0 }}>
            <label className="renew-window">Month:&nbsp;
              <select value={blockMonth} onChange={(e) => setBlockMonth(e.target.value)}>
                <option value="">All months</option>
                {blockMonths.map((k) => <option key={k} value={k}>{monthName(k)}</option>)}
              </select>
            </label>
          </div>
        )}
        <table>
          <thead><tr><th>Course</th><th>Dates</th><th>Still needs</th><th></th></tr></thead>
          <tbody>
            {shownAwaiting.length === 0 && <tr><td colSpan={4} className="empty">{blockMonth ? 'No blocks awaiting assignment this month' : 'Every upcoming block has a trainer and delegates'}</td></tr>}
            {shownAwaiting.map((b) => (
              <tr key={b.id}>
                <td><b>{b.course}</b></td>
                <td className="nowrap">{fmt(b.start)} – {fmt(b.end)}</td>
                <td>{b.missing.length ? b.missing.map((m) => <span key={m} className="b pend" style={{ marginRight: 4 }}>{m}</span>) : <span className="muted small">—</span>}</td>
                <td><button className="btn ghost sm" onClick={() => go('sched')}>Open schedule</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    )
  }
  if (id === 'assessment') {
    const { assessBlocks, isOpen, toggleCard, go } = c
    return (
      <DashCard id="assessment" title="✅ Blocks to assess" badge={assessBlocks.length} open={isOpen('assessment')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Course</th><th>Dates</th><th style={{ textAlign: 'center' }}>Delegates</th><th></th></tr></thead>
          <tbody>
            {assessBlocks.length === 0 && <tr><td colSpan={4} className="empty">No blocks with delegates yet</td></tr>}
            {assessBlocks.map((b) => (
              <tr key={b.id}>
                <td><b>{b.course}</b></td>
                <td className="nowrap">{fmt(b.start)} – {fmt(b.end)}</td>
                <td style={{ textAlign: 'center' }}>{b.count}</td>
                <td><button className="btn ghost sm" onClick={() => go('assess')}>Open assess</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    )
  }
  if (id === 'outstanding') {
    const { chase, isOpen, toggleCard } = c
    return (
      <DashCard id="outstanding" title="💷 Outstanding — to chase" badge={chase.length} open={isOpen('outstanding')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Delegate</th><th>Payer</th><th>Flags</th></tr></thead>
          <tbody>
            {chase.length === 0 && <tr><td colSpan={3} className="empty">All clear</td></tr>}
            {chase.map((x, i) => (<tr key={i}><td>{x.name}</td><td>{x.payer}</td><td><span className="b due">{x.flags.join(', ')}</span></td></tr>))}
          </tbody>
        </table>
      </DashCard>
    )
  }
  if (id === 'mlps') {
    const { mlps, isOpen, toggleCard, go } = c
    return (
      <DashCard id="mlps" title="🎓 Managed Learning Programmes" badge={`${(mlps || []).length} on programme`} open={isOpen('mlps')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Delegate</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            {(!mlps || mlps.length === 0) && <tr><td colSpan={3} className="empty">No active MLPs</td></tr>}
            {(mlps || []).map((m) => (
              <tr key={m.mlpId}>
                <td><a className="linkbtn" onClick={() => go('delegates', m.clientId)}>{m.name}</a></td>
                <td>
                  <div className="mlp-bar"><span style={{ width: (m.total ? Math.round((m.done / m.total) * 100) : 0) + '%' }}></span></div>
                  <span className="muted small">{m.done} of {m.total} courses</span>
                </td>
                <td>{m.complete ? <span className="b pass">Complete</span> : <span className="b pend">{m.total - m.done} left</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    )
  }
  return null
}

// Month at a glance — the SAME DayPilot month view as the calendar page, with
// the calendar's rich hover card (events tagged with their block id so we can
// detect the hovered block and show full course detail).
function MonthGlance({ go, user }) {
  const { data: blocks } = useData(listBlocks)
  const [anchor, setAnchor] = useState(new DayPilot.Date(new Date().toISOString().slice(0, 10)))
  const [hover, setHover] = useState(null)
  if (!blocks) return <div className="body"><div className="muted small">Loading…</div></div>
  // Admin sees every block; a staff member sees only the courses they're on.
  const myName = user?.name
  const myStaffId = user?.staffId
  const shown = user?.role === 'ADMIN'
    ? blocks
    : blocks.filter((b) => (myStaffId != null ? [b.trainerId, b.assessorId, b.verifierId].includes(myStaffId) : [b.trainer, b.assessor, b.verifier].includes(myName)))
  const blockMap = {}
  shown.forEach((b) => { blockMap[b.id] = b })
  const events = shown.filter((b) => b.start && b.end).map((b) => ({
    id: b.id, text: `${b.course} · ${b.delegates.length}\u{1F464}`,
    start: `${b.start}T09:00:00`, end: `${b.end}T17:00:00`,
    backColor: b.color || '#48566a', block: b,
  }))
  const move = (n) => setAnchor((a) => a.addMonths(n))
  function onMove(e) {
    const el = e.target && e.target.closest ? e.target.closest('[class*="mev-"]') : null
    const m = el ? (el.className || '').toString().match(/mev-(\d+)/) : null
    const b = m ? blockMap[m[1]] : null
    if (b) setHover({ b, x: e.clientX, y: e.clientY }); else setHover(null)
  }
  return (
    <div className="body">
      <div className="mc-head">
        <button className="cal-nav" onClick={() => move(-1)}>‹</button>
        <span className="mc-title">{anchor.toString('MMMM yyyy')}</span>
        <button className="cal-nav" onClick={() => move(1)}>›</button>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => go('calendar')}>Open calendar →</button>
      </div>
      <div onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <DayPilotMonth
          startDate={anchor}
          events={events}
          eventMoveHandling="Disabled"
          eventResizeHandling="Disabled"
          timeRangeSelectedHandling="Disabled"
          onBeforeEventRender={(args) => { const bk = args.data.block; const cl = bk?.color || '#48566a'; args.data.backColor = cl; args.data.barColor = cl; args.data.fontColor = '#fff'; if (bk) args.data.cssClass = 'mev-' + bk.id }}
          onEventClick={() => go('calendar')}
        />
      </div>
      {hover && <BlockHover b={hover.b} x={hover.x} y={hover.y} />}
    </div>
  )
}

// Rich hover card (matches the calendar page) — course, roles, delegates.
function BlockHover({ b, x, y }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = Math.min(x + 14, vw - 376)
  const top = Math.min(y + 14, vh - 240)
  const ddmm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '')
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
              <span>{d.name}{d.codes?.length ? <span className="muted"> · {d.codes.join(', ')}</span> : null}</span>
              <span className={'att-tag ' + (full ? 'full' : 'part')}>{full ? 'Full' : 'Part ' + ddmm(d.attendFrom) + '–' + ddmm(d.attendTo)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashCard({ id, title, badge, count, open, onToggle, children }) {
  return (
    <div className={'card collapsible' + (open ? ' open' : '')}>
      <h3 className="card-toggle" onClick={() => onToggle(id)} title={open ? 'Collapse' : 'Expand'}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        {title}
        {count != null && <span className="card-count">{count}</span>}
        {badge != null && <span className="tag">{badge}</span>}
      </h3>
      {open && children}
    </div>
  )
}

function RenewalRows({ r, cols, open, lead, tail, Actions, ContactBadge, go }) {
  return (
    <>
      <tr>
        <td><a className="linkbtn" onClick={() => go('delegates', r.clientId)}>{r.name}</a></td>
        <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
        {lead}
        <td style={{ textAlign: 'center' }}><ContactBadge r={r} /></td>
        {tail}
        <td><Actions r={r} /></td>
      </tr>
      {open && <ContactLog clientId={r.clientId} code={r.code} cols={cols} />}
    </>
  )
}

function ContactLog({ clientId, code, cols }) {
  const { data, loading } = useData(() => getRenewalContacts(clientId, code), [clientId, code])
  return (
    <tr className="logrow">
      <td></td>
      <td colSpan={cols - 1}>
        <div className="chaselog">
          <div className="muted small" style={{ marginBottom: 4 }}>Contact log:</div>
          {loading ? <span className="muted small">Loading…</span>
            : !data || data.length === 0 ? <span className="muted small">Nothing logged yet.</span>
              : data.map((cc) => (
                <div className="cl" key={cc.id}>
                  <span className="when">{fmt(cc.at)}</span>
                  <span className="b scheme">{cc.channel === 'phone' ? '📞 Call' : '✉ Email'}</span>
                  <span className="what">{cc.notes || (cc.channel === 'phone' ? '(no note)' : 'Renewal email sent')}</span>
                </div>
              ))}
        </div>
      </td>
    </tr>
  )
}

function CallModal({ target, onSave, onClose }) {
  const [note, setNote] = useState('')
  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📞 Log call — {target.name}</h3>
        <div className="muted small">{target.code} · expires {fmt(target.expiry)}{target.mobile ? ' · ' + target.mobile : ''}</div>
        <div className="chips">
          {CALL_OUTCOMES.map((cc) => <button key={cc} className="chip" onClick={() => setNote(cc)}>{cc}</button>)}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What was said? (e.g. no reply, will call back next week…)" autoFocus />
        <div className="modal-foot">
          <button className="btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="btn sm" onClick={() => onSave(note.trim())}>Save call</button>
        </div>
      </div>
    </div>
  )
}
