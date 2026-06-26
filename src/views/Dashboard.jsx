import { useState } from 'react'
import { getDashboard, recordRenewalContact, getRenewalContacts, RENEWAL_COLD_THRESHOLD } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt } from '../lib/util.js'
import { roleLabel } from '../lib/roles.js'
import { toast } from '../lib/toast.js'

// Configurable renewal look-ahead window (the meeting said "start at 6 months").
const WINDOWS = [[90, '3 months'], [180, '6 months'], [270, '9 months'], [365, '12 months']]

// Which dashboard sections each role sees (§4.10 per-user dashboards).
const SECTIONS = {
  ADMIN: { renewals: true, scheduling: true, assessment: true, outstanding: true, mlps: true },
  STANDARD: { renewals: true, scheduling: false, assessment: false, outstanding: true, mlps: true },
  SCHEDULER: { renewals: false, scheduling: true, assessment: false, outstanding: false, mlps: false },
  ASSESSOR: { renewals: false, scheduling: false, assessment: true, outstanding: false, mlps: false },
  ACCOUNTS: { renewals: false, scheduling: false, assessment: false, outstanding: true, mlps: false },
}
const STAT_KEYS = {
  ADMIN: ['renew', 'sessions', 'outstanding'],
  STANDARD: ['renew', 'sessions', 'outstanding'],
  SCHEDULER: ['unassigned', 'sessions', 'renew'],
  ASSESSOR: ['toAssess', 'sessions', 'unassigned'],
  ACCOUNTS: ['outstanding', 'cold', 'renew'],
}
// Quick-pick outcomes for the "Log call" dialog.
const CALL_OUTCOMES = ['No reply', 'Left voicemail', 'Will call back', 'Booked in', 'Not interested']

export default function Dashboard({ go, user }) {
  const [windowDays, setWindowDays] = useState(180)
  const { data, loading, reload } = useData(() => getDashboard({ windowDays }), [windowDays])
  const [callTarget, setCallTarget] = useState(null) // the renewal row we're logging a call for
  const [openLog, setOpenLog] = useState(null)        // `${clientId}:${code}` whose history is expanded
  const [blockMonth, setBlockMonth] = useState('')    // '' = all months, else 'YYYY-MM'
  if (loading || !data) return <div className="loading">Loading dashboard…</div>
  const { renewals, coldList, chase, counts, mlps, awaitingBlocks, assessBlocks } = data
  const role = user?.role || 'ADMIN'
  const see = SECTIONS[role] || SECTIONS.ADMIN
  const windowLabel = (WINDOWS.find(([d]) => d === windowDays) || [, windowDays + ' days'])[1]

  const STAT = {
    renew: [counts.renew, `Expiring within ${windowLabel}`, 'amber'],
    sessions: [counts.sessions, 'Scheduled sessions', 'brand'],
    outstanding: [counts.outstanding, 'Payments outstanding', 'green'],
    unassigned: [counts.unassigned, 'Blocks awaiting assignment', 'amber'],
    toAssess: [counts.toAssess, 'Delegates to assess', 'brand'],
    cold: [counts.cold, 'On the cold list (phone)', 'green'],
  }
  const statKeys = STAT_KEYS[role] || STAT_KEYS.ADMIN
  const logKey = (r) => `${r.clientId}:${r.code}`

  // Month filter for "blocks awaiting assignment" (the meeting asked to filter by month).
  const monthKey = (iso) => (iso ? iso.slice(0, 7) : '')
  const monthName = (key) => { const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
  const blockMonths = [...new Set((awaitingBlocks || []).map((b) => monthKey(b.start)).filter(Boolean))].sort()
  const shownAwaiting = blockMonth ? (awaitingBlocks || []).filter((b) => monthKey(b.start) === blockMonth) : (awaitingBlocks || [])

  // Send one individualised renewal email (GDPR: one-by-one, never bulk).
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
  function toggleLog(r) {
    const k = logKey(r)
    setOpenLog((cur) => (cur === k ? null : k))
  }

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  // Shared action buttons + contact-count badge + expandable history row.
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

  return (
    <>
      <div className="dash-greet">👋 {greet}{user?.name ? ', ' + user.name : ''} <span className="role-chip">{roleLabel(role)}</span></div>

      <div className="row c3" style={{ marginBottom: 18 }}>
        {statKeys.map((k) => {
          const [n, l, cls] = STAT[k]
          return <div className="card" key={k}><div className={'body stat ' + cls}><div className="n">{n}</div><div className="l">{l}</div></div></div>
        })}
      </div>

      {see.renewals && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>🔔 Renewal engine — expiring soon <span className="tag">nightly scan</span></h3>
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
        </div>
      )}

      {see.renewals && coldList.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>📞 Cold list — phone follow-up <span className="tag">{coldList.length} after {RENEWAL_COLD_THRESHOLD}+ emails</span></h3>
          <table>
            <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th style={{ textAlign: 'center' }}>Contacts</th><th>Mobile</th><th>Actions</th></tr></thead>
            <tbody>
              {coldList.map((r) => (
                <RenewalRows key={logKey(r)} r={r} cols={6} open={openLog === logKey(r)} Actions={Actions} ContactBadge={ContactBadge}
                  lead={<td className="nowrap">{fmt(r.expiry)}</td>}
                  tail={<td className="nowrap">{r.mobile || '—'}</td>} go={go} />
              ))}
            </tbody>
          </table>
          <div className="banner">These delegates haven't answered {RENEWAL_COLD_THRESHOLD} or more renewal emails — work them by phone. Use <b>Log call</b> to record what was said (or "no reply"); it's saved to the contact log under <b>Log</b>.</div>
        </div>
      )}

      {see.scheduling && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>🗓 Blocks awaiting assignment <span className="tag">{blockMonth ? `${shownAwaiting.length} of ${awaitingBlocks.length}` : awaitingBlocks.length}</span></h3>
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
              {shownAwaiting.length === 0 && <tr><td colSpan={4} className="empty">{blockMonth ? 'No blocks awaiting assignment this month' : 'Every block has a trainer and delegates'}</td></tr>}
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
        </div>
      )}

      {see.assessment && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>✅ Blocks to assess <span className="tag">{assessBlocks.length}</span></h3>
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
        </div>
      )}

      {(see.outstanding || see.mlps) && (
        <div className="row c2">
          {see.outstanding && (
            <div className="card">
              <h3>💷 Outstanding — to chase</h3>
              <table>
                <thead><tr><th>Delegate</th><th>Payer</th><th>Flags</th></tr></thead>
                <tbody>
                  {chase.length === 0 && <tr><td colSpan={3} className="empty">All clear</td></tr>}
                  {chase.map((c, i) => (
                    <tr key={i}><td>{c.name}</td><td>{c.payer}</td><td><span className="b due">{c.flags.join(', ')}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {see.mlps && (
            <div className="card">
              <h3>🎓 Managed Learning Programmes <span className="tag">{(mlps || []).length} on programme</span></h3>
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
            </div>
          )}
        </div>
      )}

      {callTarget && <CallModal target={callTarget} onSave={saveCall} onClose={() => setCallTarget(null)} />}
    </>
  )
}

// A renewal/cold-list row plus (when open) its expandable contact-history row.
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
              : data.map((c) => (
                <div className="cl" key={c.id}>
                  <span className="when">{fmt(c.at)}</span>
                  <span className="b scheme">{c.channel === 'phone' ? '📞 Call' : '✉ Email'}</span>
                  <span className="what">{c.notes || (c.channel === 'phone' ? '(no note)' : 'Renewal email sent')}</span>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📞 Log call — {target.name}</h3>
        <div className="muted small">{target.code} · expires {fmt(target.expiry)}{target.mobile ? ' · ' + target.mobile : ''}</div>
        <div className="chips">
          {CALL_OUTCOMES.map((c) => <button key={c} className="chip" onClick={() => setNote(c)}>{c}</button>)}
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
