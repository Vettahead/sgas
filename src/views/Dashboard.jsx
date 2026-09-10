import { useState, useRef, useEffect } from 'react'
import { MiniMonth } from './CalendarNext.jsx'
import { getDashboard, listBlocks, recordRenewalContact, getRenewalContacts, RENEWAL_COLD_THRESHOLD, listHolidayRequests, decideHoliday, getSettings, canApproveHolidays, listInquiries, listMyMentions, INQUIRY_CLOSE_REASONS, listDocumentation, staffYearSummary, listFollowUps, setFollowUpDone } from '../lib/api.js'
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
  { id: 'holreq', title: '🏖 Holiday requests', roles: ['ADMIN', 'STANDARD', 'SCHEDULER', 'ASSESSOR', 'ACCOUNTS'] },
  { id: 'scheduling', title: '🗓 Blocks awaiting assignment', roles: ['ADMIN', 'SCHEDULER'] },
  { id: 'assessment', title: '✅ Blocks to assess', roles: ['ADMIN', 'ASSESSOR'] },
  { id: 'outstanding', title: '💷 Outstanding to chase', roles: ['ADMIN', 'STANDARD', 'ACCOUNTS'] },
  { id: 'mlps', title: '🎓 Managed Learning Programmes', roles: ['ADMIN', 'STANDARD'] },
  // Jen walkthrough §7 — the three numbers nobody could get before.
  { id: 'enquiries', title: '💬 Enquiries', roles: ['ADMIN', 'STANDARD', 'SCHEDULER'] },
  { id: 'docs', title: '📄 Certificates in progress', roles: ['ADMIN', 'STANDARD'] },
  { id: 'staffyear', title: '👷 Staff this year', roles: ['ADMIN'] },
  // Reminders raised by the system — first: ring somebody whose booking had a
  // qualification added from outside the course's grouping.
  { id: 'followups', title: '📞 Follow-ups', roles: ['ADMIN', 'STANDARD', 'SCHEDULER'] },
]

const OPEN_KEY = 'sgas_dash_open'
const layoutKey = (role) => 'sgas_dash_layout_' + role
const loadSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')) } catch { return new Set() } }
const defaultLayout = (role) => MODULES.filter((m) => m.roles.includes(role)).map((m) => m.id)
// Modules added after a layout was saved would otherwise never appear for
// anyone who had already customised — they would sit under "Add a module"
// unseen. NEW_SINCE lists what each layout version brought; a saved layout
// older than the current version gets those appended once.
const LAYOUT_VERSION = 3
const NEW_SINCE = { 2: ['enquiries', 'docs', 'staffyear'], 3: ['followups'] }
function loadLayout(role) {
  try {
    const v = JSON.parse(localStorage.getItem(layoutKey(role)))
    if (!Array.isArray(v)) return defaultLayout(role)
    const seen = Number(localStorage.getItem(layoutKey(role) + '_v') || 1)
    if (seen >= LAYOUT_VERSION) return v
    const allowed = new Set(defaultLayout(role))
    const out = [...v]
    for (let ver = seen + 1; ver <= LAYOUT_VERSION; ver++) for (const id of NEW_SINCE[ver] || []) if (allowed.has(id) && !out.includes(id)) out.push(id)
    try { localStorage.setItem(layoutKey(role), JSON.stringify(out)); localStorage.setItem(layoutKey(role) + '_v', String(LAYOUT_VERSION)) } catch { /* ignore */ }
    return out
  } catch { return defaultLayout(role) }
}
const saveLayout = (role, ids) => { try { localStorage.setItem(layoutKey(role), JSON.stringify(ids)); localStorage.setItem(layoutKey(role) + '_v', String(LAYOUT_VERSION)) } catch { /* ignore */ } }
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
  /* The renewal list is the whole point of the engine and it is also 251 rows
     long on a six-month window, which is a screenful of dashboard and then
     twenty of table. It shows the most urgent handful and says how many more
     there are, the same way the calendar's side panel does. */
  const [showAll, setShowAll] = useState({})
  if (loading || !data) return <div className="loading">Loading dashboard…</div>

  const { renewals, coldList, chase, counts, mlps, awaitingBlocks, assessBlocks } = data
  const windowLabel = (WINDOWS.find(([d]) => d === windowDays) || [, windowDays + ' days'])[1]

  const isOpen = (id) => openCards.has(id)
  const toggleCard = (id) => setOpenCards((prev) => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id)
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
    return s
  })

  /* Every number is the top of something. It used to be a figure you could
     read and not reach — a count of payments outstanding with the payments
     screen three clicks away. Each tile now takes you to the thing it counts:
     to another screen where one exists, or, where the list is already on this
     page, it opens that card and scrolls to it. */
  const STAT = {
    renew:       [counts.renew,       `Expiring within ${windowLabel}`, 'amber', { card: 'renewals',    or: 'delegates' }],
    sessions:    [counts.sessions,    'Scheduled sessions',             'brand', { go: 'calendar' }],
    outstanding: [counts.outstanding, 'Payments outstanding',           'green', { card: 'outstanding', or: 'pay' }],
    unassigned:  [counts.unassigned,  'Blocks awaiting assignment',     'amber', { card: 'scheduling',  or: 'calendar' }],
    toAssess:    [counts.toAssess,    'Delegates to assess',            'brand', { card: 'assessment',  or: 'assess' }],
    cold:        [counts.cold,        'On the cold list (phone)',       'green', { card: 'cold',        or: 'delegates' }],
  }
  // Open the card the number belongs to and put it under the eye. Opening it
  // and leaving the page where it was is the same as doing nothing.
  function openStat(to) {
    if (to?.go) { go(to.go); return }
    if (!to?.card) return
    // The card may not be on this dashboard at all — a Scheduler sees the
    // renewals NUMBER but not the renewals list, and anyone can take a module
    // off their own layout. Send them to the screen instead of doing nothing.
    if (!visible.includes(to.card)) { if (to.or) go(to.or); return }
    if (!openCards.has(to.card)) toggleCard(to.card)
    setTimeout(() => {
      document.getElementById('dash-' + to.card)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
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
    go, user, isOpen, toggleCard, openStat, showAll, setShowAll,
    renewals, coldList, chase, mlps, counts, STAT, statKeys,
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
          const [n, l, cls, to] = c.STAT[k]
          return (
            <button type="button" className="card statbtn" key={k} onClick={() => c.openStat(to)}
              title={to?.go ? `Open ${to.go}` : 'Show the list'}>
              <div className={'body stat ' + cls}><div className="n">{n}</div><div className="l">{l}</div></div>
            </button>
          )
        })}
      </div>
    )
  }
  if (id === 'calendar') {
    return (
      <DashCard id="calendar" title="📅 Your month at a glance" open={c.isOpen('calendar')} onToggle={c.toggleCard}>
        <MonthGlance2 go={c.go} user={c.user} />
      </DashCard>
    )
  }
  if (id === 'holreq') {
    return <HolidayRequests user={c.user} isOpen={c.isOpen} toggleCard={c.toggleCard} />
  }
  if (id === 'renewals') {
    const { renewals, isOpen, toggleCard, windowDays, setWindowDays, logKey, openLog, Actions, ContactBadge, go, showAll, setShowAll } = c
    const shown = firstOf('renewals', renewals, showAll)
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
            {shown.map((r) => (
              <RenewalRows key={logKey(r)} r={r} cols={6} open={openLog === logKey(r)} Actions={Actions} ContactBadge={ContactBadge}
                lead={<>
                  <td className="nowrap">{fmt(r.expiry)}</td>
                  <td><span className={'b ' + (r.days <= 90 ? 'due' : 'scheme')}>{r.days} days</span></td>
                </>} go={go} />
            ))}
          </tbody>
        </table>
        <ShowRest id="renewals" list={renewals} showAll={showAll} setShowAll={setShowAll} what="due later" />
        <div className="banner">Cross-references qualification expiry against the look-ahead window. A delegate already booked for their renewal drops off the list; if they don't attend, they reappear. Every email and call is individualised and logged (GDPR — no bulk sends).</div>
      </DashCard>
    )
  }
  if (id === 'cold') {
    const { coldList, isOpen, toggleCard, logKey, openLog, Actions, ContactBadge, go, showAll, setShowAll } = c
    const shownCold = firstOf('cold', coldList, showAll)
    return (
      <DashCard id="cold" title="📞 Cold list — phone follow-up" badge={`${coldList.length} after ${RENEWAL_COLD_THRESHOLD}+ emails`} count={coldList.length} open={isOpen('cold')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th style={{ textAlign: 'center' }}>Contacts</th><th>Mobile</th><th>Actions</th></tr></thead>
          <tbody>
            {coldList.length === 0 && <tr><td colSpan={6} className="empty">No one on the cold list</td></tr>}
            {shownCold.map((r) => (
              <RenewalRows key={logKey(r)} r={r} cols={6} open={openLog === logKey(r)} Actions={Actions} ContactBadge={ContactBadge}
                lead={<td className="nowrap">{fmt(r.expiry)}</td>}
                tail={<td className="nowrap">{r.mobile || '—'}</td>} go={go} />
            ))}
          </tbody>
        </table>
        <ShowRest id="cold" list={coldList} showAll={showAll} setShowAll={setShowAll} what="to ring" />
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
                <td><button className="btn ghost sm" onClick={() => go('calendarnext', { date: b.start, id: b.id })}>Open the calendar</button></td>
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
                <td><button className="btn ghost sm" onClick={() => go('assess', b.id)}>Open assess</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DashCard>
    )
  }
  if (id === 'outstanding') {
    const { chase, isOpen, toggleCard, go } = c
    return (
      <DashCard id="outstanding" title="💷 Outstanding — to chase" badge={chase.length} open={isOpen('outstanding')} onToggle={toggleCard}>
        <table>
          <thead><tr><th>Delegate</th><th>Payer</th><th>Outstanding</th></tr></thead>
          <tbody>
            {chase.length === 0 && <tr><td colSpan={3} className="empty">All clear</td></tr>}
            {chase.map((x, i) => (
              <tr key={x.bookingId || i}>
                <td>{x.clientId ? <button className="dn-link" onClick={() => go('delegates', x.clientId)}>{x.name}</button> : x.name}</td>
                <td>{x.payer}</td>
                <td><span className="b due">{x.flags.join(', ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="body" style={{ paddingTop: 10 }}><button className="btn ghost sm" onClick={() => go('pay')}>Open Payments &amp; chase</button></div>
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
  if (id === 'enquiries') return <EnquiriesModule go={c.go} user={c.user} isOpen={c.isOpen} toggleCard={c.toggleCard} />
  if (id === 'docs') return <DocsModule go={c.go} isOpen={c.isOpen} toggleCard={c.toggleCard} />
  if (id === 'staffyear') return <StaffYearModule go={c.go} isOpen={c.isOpen} toggleCard={c.toggleCard} />
  if (id === 'followups') return <FollowUpsModule go={c.go} isOpen={c.isOpen} toggleCard={c.toggleCard} />
  return null
}

// "Somebody needs to ring them." Ticked off here; Undo on the toast puts it
// back. Renders even when empty so people know where these land.
function FollowUpsModule({ go, isOpen, toggleCard }) {
  const { data, reload } = useData(listFollowUps)
  const rows = data || []
  async function done(f) {
    try {
      await setFollowUpDone(f.id, true)
      toast(`Done: ${f.title}`, { undo: async () => { try { await setFollowUpDone(f.id, false); reload() } catch (e) { toast(e.message) } } })
      reload()
    } catch (e) { toast('Could not save: ' + e.message) }
  }
  return (
    <DashCard id="followups" title="📞 Follow-ups" badge={rows.length} count={rows.length} open={isOpen('followups')} onToggle={toggleCard}>
      <table>
        <thead><tr><th>What</th><th>Raised</th><th></th></tr></thead>
        <tbody>
          {!data && <tr><td colSpan={3} className="empty">Loading…</td></tr>}
          {data && rows.length === 0 && <tr><td colSpan={3} className="empty">Nothing to follow up</td></tr>}
          {rows.map((f) => (
            <tr key={f.id}>
              <td>
                <b>{f.title}</b>
                {f.detail && <div className="muted small">{f.detail}</div>}
                <div className="small" style={{ marginTop: 4 }}>
                  {f.clientId && <button className="dn-link" onClick={() => go('delegates', f.clientId)}>delegate</button>}
                  {f.clientId && f.sessionId && ' · '}
                  {f.sessionId && <button className="dn-link" onClick={() => go('calendarnext', { id: f.sessionId })}>course</button>}
                </div>
              </td>
              <td className="muted small nowrap">{f.by}<br />{fmt(f.at)}</td>
              <td className="nowrap"><button className="btn ghost sm" onClick={() => done(f)}>✓ Done</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="banner">Raised automatically — for now, when a qualification from another course grouping is added to somebody's booking on the calendar, which usually means something to timetable and a phone call. Tick it when it is dealt with.</div>
    </DashCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Jen walkthrough §7 — three modules that load their own data.
// ─────────────────────────────────────────────────────────────────────────────

// Open enquiries, what is waiting for ME, and the year's conversion figure.
function EnquiriesModule({ go, user, isOpen, toggleCard }) {
  const { data: inqs } = useData(listInquiries)
  const { data: mine } = useData(() => listMyMentions(user))
  const all = inqs || []
  const open = all.filter((q) => q.status === 'open')
  const y = new Date().getFullYear()
  const year = all.filter((q) => new Date(q.createdAt).getFullYear() === y)
  const conv = year.filter((q) => q.status === 'converted').length
  const closed = year.filter((q) => q.status === 'closed')
  const reasons = {}
  for (const q of closed) reasons[q.closeReason || 'other'] = (reasons[q.closeReason || 'other'] || 0) + 1
  const label = (k) => INQUIRY_CLOSE_REASONS.find((r) => r.k === k)?.label || k
  const pct = year.length ? Math.round((conv / year.length) * 100) : 0
  const stale = open.filter((q) => (Date.now() - new Date(q.createdAt)) > 3 * 86400000).length
  return (
    <DashCard id="enquiries" title="💬 Enquiries" badge={`${open.length} open`} count={open.length} open={isOpen('enquiries')} onToggle={toggleCard}>
      <div className="body">
        <div className="stat-row">
          <div className="stat brand"><div className="n">{open.length}</div><div className="l">open{stale ? ` · ${stale} older than 3 days` : ''}</div></div>
          <div className="stat amber"><div className="n">{(mine || []).length}</div><div className="l">waiting for you</div></div>
          <div className="stat green"><div className="n">{pct}%</div><div className="l">converted this year · {conv} of {year.length}</div></div>
        </div>
        {closed.length > 0 && <div className="muted small" style={{ marginTop: 10 }}>Lost this year: {Object.entries(reasons).map(([k, n]) => `${label(k)} ${n}`).join(', ')}.</div>}
        <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => go('inquiries')}>Open enquiries</button></div>
      </div>
    </DashCard>
  )
}

// Certificates at each stage, so "a pile on the desk" has a number.
function DocsModule({ go, isOpen, toggleCard }) {
  const { data } = useData(listDocumentation)
  const rows = data || []
  const toSend = rows.filter((d) => !d.sent).length
  const awaiting = rows.filter((d) => d.sent && d.certReturns && !d.received).length
  const toClient = rows.filter((d) => d.sent && d.certReturns && d.received && !d.client).length
  const n = toSend + awaiting + toClient
  return (
    <DashCard id="docs" title="📄 Certificates in progress" badge={n} count={n} open={isOpen('docs')} onToggle={toggleCard}>
      <div className="body">
        <div className="stat-row">
          <div className="stat amber"><div className="n">{toSend}</div><div className="l">to send to the awarding body</div></div>
          <div className="stat brand"><div className="n">{awaiting}</div><div className="l">out with the awarding body</div></div>
          <div className="stat green"><div className="n">{toClient}</div><div className="l">back, to send to the client</div></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={() => go('docs')}>Open documentation</button></div>
      </div>
    </DashCard>
  )
}

// "How many courses has Simon assessed this year?" — a number, not a hunt.
function StaffYearModule({ go, isOpen, toggleCard }) {
  const { data: blocks } = useData(listBlocks)
  const [year, setYear] = useState(new Date().getFullYear())
  const rows = staffYearSummary(blocks, year)
  const years = [...new Set((blocks || []).map((b) => (b.start || '').slice(0, 4)).filter(Boolean))].sort().reverse()
  return (
    <DashCard id="staffyear" title="👷 Staff this year" badge={`${rows.length} people`} count={rows.length} open={isOpen('staffyear')} onToggle={toggleCard}>
      <div className="body" style={{ paddingBottom: 0 }}>
        <label className="renew-window">Year:&nbsp;
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {(years.length ? years : [String(year)]).map((yy) => <option key={yy} value={yy}>{yy}</option>)}
          </select>
        </label>
        <span className="muted small" style={{ marginLeft: 10 }}>Courses on the calendar with this person in that role. Internal courses are not counted.</span>
      </div>
      <table>
        <thead><tr><th>Person</th><th style={{ textAlign: 'center' }}>Trained</th><th style={{ textAlign: 'center' }}>Assessed</th><th style={{ textAlign: 'center' }}>Verified</th><th style={{ textAlign: 'center' }}>Assisted</th></tr></thead>
        <tbody>
          {!blocks && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
          {blocks && rows.length === 0 && <tr><td colSpan={5} className="empty">Nothing on the calendar for {year}</td></tr>}
          {rows.map((r) => (
            <tr key={r.name}>
              <td><b>{r.name}</b></td>
              <td style={{ textAlign: 'center' }}>{r.trained || <span className="muted">—</span>}</td>
              <td style={{ textAlign: 'center' }}>{r.assessed || <span className="muted">—</span>}</td>
              <td style={{ textAlign: 'center' }}>{r.verified || <span className="muted">—</span>}</td>
              <td style={{ textAlign: 'center' }}>{r.assisted || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="banner">Sessions with nobody in a role are the ones the "Blocks awaiting assignment" card lists — if a course was assessed but nobody was put on it, it is not counted here, which is the point: put the assessor on the course.</div>
    </DashCard>
  )
}

// Month at a glance — the SAME month grid as the calendar page, with
// hover detail handled by the shared grid itself.
function MonthGlance2({ go, user }) {
  const { data: blocks } = useData(listBlocks)
  if (!blocks) return <div className="body"><div className="muted small">Loading…</div></div>
  // Admin sees every course; a staff member sees only the ones they are on.
  const myName = user?.name
  const myStaffId = user?.staffId
  const shown = user?.role === 'ADMIN'
    ? blocks
    : blocks.filter((b) => (myStaffId != null ? [b.trainerId, b.assessorId, b.verifierId].includes(myStaffId) : [b.trainer, b.assessor, b.verifier].includes(myName)))
  return (
    <div className="body">
      {/* The SAME grid the Calendar screen draws. This used to be the old
          calendar's MonthView, which is why the retired screen was still
          staring at you from the Dashboard. */}
      <MiniMonth blocks={shown.filter((b) => b.start && b.end)} onOpen={() => go('calendarnext')} />
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────────────────
// Holiday requests, for whoever approves them.
//
// Renders NOTHING unless this person can approve and something is waiting —
// a card that says "no requests" every day of the year is a card people stop
// reading. Approving or rejecting emails the person who asked; a rejection
// asks for a reason first, because "no" without one is the thing that gets
// argued about later.
// ─────────────────────────────────────────────────────────────────────────────
function HolidayRequests({ user, isOpen, toggleCard }) {
  const [rows, setRows] = useState(null)
  const [can, setCan] = useState(false)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    try { setRows(await listHolidayRequests()) } catch { setRows([]) }
  }

  const started = useRef(false)
  if (!started.current) {
    started.current = true
    getSettings()
      .then((s) => { setCan(canApproveHolidays(user, s)); return canApproveHolidays(user, s) ? reload() : null })
      .catch(() => setCan(false))
  }

  async function decide(h, decision) {
    setBusy(true)
    try {
      await decideHoliday(h.holidayId, decision, { note: reason, decidedBy: user?.staffId || null })
      toast(decision === 'APPROVED' ? `${h.staffName}'s holiday approved` : `${h.staffName}'s request turned down`)
      setRejecting(null); setReason('')
      await reload()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  if (!can || !rows || rows.length === 0) return null

  return (
    <DashCard id="holreq" title="🏖 Holiday requests" badge={`${rows.length} waiting`} count={rows.length}
      open={isOpen('holreq')} onToggle={toggleCard}>
      <table>
        <thead><tr><th>Who</th><th>When</th><th>Note</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.holidayId}>
              <td><b>{h.staffName}</b></td>
              <td className="muted nowrap">{fmt(h.start)} – {fmt(h.end)}</td>
              <td className="muted small">{h.note || '—'}</td>
              <td>
                {rejecting === h.holidayId ? (
                  <span className="inrow" style={{ flexWrap: 'wrap', maxWidth: 420 }}>
                    <input type="text" placeholder="Why not? They will be told." value={reason}
                      onChange={(e) => setReason(e.target.value)} />
                    <button className="btn sm" disabled={busy} onClick={() => decide(h, 'REJECTED')}>Send</button>
                    <button className="btn ghost sm" onClick={() => { setRejecting(null); setReason('') }}>✕</button>
                  </span>
                ) : (
                  <span className="inrow">
                    <button className="btn sm" disabled={busy} onClick={() => decide(h, 'APPROVED')}>Approve</button>
                    <button className="btn ghost sm" disabled={busy} onClick={() => { setRejecting(h.holidayId); setReason('') }}>Reject</button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DashCard>
  )
}

// A long list shows its most urgent handful and says how many more there are.
// The count in the heading always tells the truth about the whole list, so the
// number and the rows never disagree — a heading saying 251 above 12 rows with
// no way to reach the rest is worse than either.
const FIRST = 12
function ShowRest({ id, list, showAll, setShowAll, what }) {
  if (list.length <= FIRST) return null
  const on = !!showAll[id]
  return (
    <div className="body" style={{ paddingTop: 0 }}>
      <button className="btn ghost sm" onClick={() => setShowAll((v) => ({ ...v, [id]: !on }))}>
        {on ? `Show just the ${FIRST} most urgent` : `Show the other ${list.length - FIRST} ${what}`}
      </button>
    </div>
  )
}
const firstOf = (id, list, showAll) => (showAll[id] ? list : list.slice(0, FIRST))

function DashCard({ id, title, badge, count, open, onToggle, children }) {
  return (
    <div className={'card collapsible' + (open ? ' open' : '')} id={'dash-' + id}>
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
  // Escape closes, like every other dialog in the app; so does the backdrop.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label={`Log call — ${target.name}`}>
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
