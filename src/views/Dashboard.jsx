import { useState } from 'react'
import { getDashboard, recordRenewalContact, RENEWAL_COLD_THRESHOLD } from '../lib/api.js'
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
// Which three stat tiles each role gets, in order.
const STAT_KEYS = {
  ADMIN: ['renew', 'sessions', 'outstanding'],
  STANDARD: ['renew', 'sessions', 'outstanding'],
  SCHEDULER: ['unassigned', 'sessions', 'renew'],
  ASSESSOR: ['toAssess', 'sessions', 'unassigned'],
  ACCOUNTS: ['outstanding', 'cold', 'renew'],
}

export default function Dashboard({ go, user }) {
  const [windowDays, setWindowDays] = useState(180)
  const { data, loading, reload } = useData(() => getDashboard({ windowDays }), [windowDays])
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

  // One renewal email at a time (GDPR: individualised, never bulk). Logs the
  // contact and opens the user's mail client with a templated message.
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
  async function logCall(r) {
    await recordRenewalContact(r.clientId, r.code, 'phone')
    toast(`Phone follow-up logged for ${r.name} (${r.code})`)
    reload()
  }

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

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
            <span className="muted small" style={{ marginLeft: 10 }}>Booked-in delegates drop off automatically; one renewal email at a time.</span>
          </div>
          <table>
            <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th>In</th><th style={{ textAlign: 'center' }}>Emails</th><th></th></tr></thead>
            <tbody>
              {renewals.length === 0 && <tr><td colSpan={6} className="empty">Nothing expiring in the window</td></tr>}
              {renewals.map((r, i) => (
                <tr key={i}>
                  <td><a className="linkbtn" onClick={() => go('delegates', r.clientId)}>{r.name}</a></td>
                  <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                  <td className="nowrap">{fmt(r.expiry)}</td>
                  <td><span className={'b ' + (r.days <= 90 ? 'due' : 'scheme')}>{r.days} days</span></td>
                  <td style={{ textAlign: 'center' }}>{r.contacts > 0 ? <span className="b scheme" title={r.lastContact ? 'Last: ' + fmt(r.lastContact) : ''}>{r.contacts}</span> : <span className="muted small">—</span>}</td>
                  <td><button className="btn ghost sm" onClick={() => emailRenewal(r)}>Email</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="banner">Cross-references qualification expiry against the look-ahead window. A delegate already booked for their renewal drops off the list; if they don't attend, they reappear. Each email is individualised and logged (GDPR — no bulk sends).</div>
        </div>
      )}

      {see.renewals && coldList.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>📞 Cold list — phone follow-up <span className="tag">{coldList.length} after {RENEWAL_COLD_THRESHOLD}+ emails</span></h3>
          <table>
            <thead><tr><th>Delegate</th><th>Qualification</th><th>Expires</th><th style={{ textAlign: 'center' }}>Emails sent</th><th>Mobile</th><th></th></tr></thead>
            <tbody>
              {coldList.map((r, i) => (
                <tr key={i}>
                  <td><a className="linkbtn" onClick={() => go('delegates', r.clientId)}>{r.name}</a></td>
                  <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                  <td className="nowrap">{fmt(r.expiry)}</td>
                  <td style={{ textAlign: 'center' }}><span className="b due">{r.contacts}</span></td>
                  <td className="nowrap">{r.mobile || '—'}</td>
                  <td><button className="btn ghost sm" onClick={() => logCall(r)}>Log call</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="banner">These delegates haven't answered {RENEWAL_COLD_THRESHOLD} or more renewal emails — hand to phone follow-up (e.g. a ring-round) rather than emailing again.</div>
        </div>
      )}

      {see.scheduling && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>🗓 Blocks awaiting assignment <span className="tag">{awaitingBlocks.length}</span></h3>
          <table>
            <thead><tr><th>Course</th><th>Dates</th><th>Still needs</th><th></th></tr></thead>
            <tbody>
              {awaitingBlocks.length === 0 && <tr><td colSpan={4} className="empty">Every block has a trainer and delegates</td></tr>}
              {awaitingBlocks.map((b) => (
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
    </>
  )
}
