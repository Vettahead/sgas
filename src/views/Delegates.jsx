import { useMemo, useState } from 'react'
import { listDelegates, getDelegateHistory } from '../lib/api.js'
import { useData } from '../lib/hooks.js'
import { fmt, initials, resultClass, daysUntil } from '../lib/util.js'

// Roll the booking history up into the delegate's current accreditations:
// one row per qualification, keeping the most-recent PASS, cross-referenced
// against today to flag what's due for renewal.
function renewalSummary(bookings) {
  const byCode = {}
  for (const b of bookings) {
    for (const x of b.categories) {
      if (x.result !== 'PASS') continue
      const prev = byCode[x.code]
      if (!prev || (x.achieved || '') > (prev.achieved || '')) {
        byCode[x.code] = { code: x.code, desc: x.desc, achieved: x.achieved, expiry: x.expiry, course: b.course }
      }
    }
  }
  const rows = Object.values(byCode).map((r) => {
    const d = r.expiry ? daysUntil(r.expiry) : null
    let status = 'none'
    if (d != null) status = d < 0 ? 'expired' : d <= 90 ? 'soon' : 'active'
    return { ...r, days: d, status }
  }).sort((a, b) => {
    const order = { expired: 0, soon: 1, active: 2, none: 3 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return (a.expiry || '') < (b.expiry || '') ? -1 : 1
  })
  return rows
}

const RENEWAL_BADGE = {
  active: ['pass', 'Active'],
  soon: ['due', 'Renew soon'],
  expired: ['fail', 'Expired'],
  none: ['scheme', 'No expiry'],
}

export default function Delegates({ openDelegate }) {
  const [selected, setSelected] = useState(openDelegate || null)
  if (selected) return <DelegateDetail clientId={selected} back={() => setSelected(null)} />
  return <DelegateList onOpen={setSelected} />
}

function DelegateList({ onOpen }) {
  const { data, loading } = useData(listDelegates)
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    if (!s) return data
    return data.filter((c) =>
      `${c.forename} ${c.surname}`.toLowerCase().includes(s) ||
      (c.ni_number || '').toLowerCase().includes(s) ||
      (c.company || '').toLowerCase().includes(s)
    )
  }, [data, q])

  if (loading) return <div className="loading">Loading delegates…</div>

  return (
    <div className="card">
      <h3>👤 Delegates <span className="tag">{rows.length} shown</span></h3>
      <div style={{ padding: '14px 18px 0' }}>
        <div className="searchbar">
          <input type="search" placeholder="Search by name, NI number, or company…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Associated company</th><th>NI number</th><th>Date of birth</th><th>Mobile</th><th>Email</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="empty">No matching delegates</td></tr>}
          {rows.map((c) => (
            <tr key={c.client_id} className="clickrow" onClick={() => onOpen(c.client_id)}>
              <td><b>{c.forename} {c.surname}</b></td>
              <td>{c.company}</td>
              <td className="muted">{c.ni_number || '—'}</td>
              <td className="muted">{c.date_of_birth ? fmt(c.date_of_birth) : '—'}</td>
              <td className="muted">{c.mobile || '—'}</td>
              <td className="muted">{c.email || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DelegateDetail({ clientId, back }) {
  const { data, loading } = useData(() => getDelegateHistory(clientId), [clientId])
  if (loading || !data) return <div className="loading">Loading history…</div>
  const { client, bookings } = data
  const renewals = renewalSummary(bookings)
  const expiredCount = renewals.filter((r) => r.status === 'expired').length
  const soonCount = renewals.filter((r) => r.status === 'soon').length

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="btn ghost sm" onClick={back}>← All delegates</button>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          <span className="av" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-soft)', color: 'var(--brand-dark)', fontSize: 12, fontWeight: 700, marginRight: 4 }}>{initials(client.forename, client.surname)}</span>
          {client.forename} {client.surname}
        </h3>
        <div className="body">
          <div className="twocol">
            <Field label="Associated company" value={client.company} />
            <Field label="NI number" value={client.ni_number} />
            <Field label="Date of birth" value={client.date_of_birth ? fmt(client.date_of_birth) : '—'} />
            <Field label="Mobile" value={client.mobile} />
            <Field label="Email" value={client.email} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>🎓 Qualifications & renewals <span className="tag">{renewals.length} held</span></h3>
        <div className="body">
          {renewals.length === 0 && <div className="empty">No achieved qualifications yet.</div>}
          {renewals.length > 0 && (
            <>
              {(expiredCount > 0 || soonCount > 0) && (
                <div className="renew-alert">
                  {expiredCount > 0 && <span className="b fail">{expiredCount} expired</span>}
                  {soonCount > 0 && <span className="b due">{soonCount} due within 90 days</span>}
                </div>
              )}
              <table>
                <thead><tr><th>Qualification</th><th>From course</th><th>Achieved</th><th>Expires</th><th>Renewal</th></tr></thead>
                <tbody>
                  {renewals.map((r) => {
                    const [cls, label] = RENEWAL_BADGE[r.status]
                    return (
                      <tr key={r.code} className={r.status === 'expired' ? 'noshow-row' : ''}>
                        <td><b>{r.code}</b> <span className="muted small">{r.desc}</span></td>
                        <td className="muted">{r.course}</td>
                        <td className="muted nowrap">{fmt(r.achieved)}</td>
                        <td className="muted nowrap">{fmt(r.expiry)}</td>
                        <td className="nowrap">
                          <span className={'b ' + cls}>{label}</span>
                          {r.days != null && r.status === 'soon' && <span className="muted small" style={{ marginLeft: 6 }}>{r.days}d</span>}
                          {r.days != null && r.status === 'expired' && <span className="muted small" style={{ marginLeft: 6 }}>{-r.days}d ago</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h3>📜 Accreditation history <span className="tag">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</span></h3>
        <div className="body">
          {bookings.length === 0 && <div className="empty">No bookings on record.</div>}
          {bookings.map((b) => (
            <div className="timeline-bk" key={b.bookingId}>
              <div className="bh">
                <span className="nm">{b.course}</span>
                <span className={'b ' + resultClass(b.overall)}>{b.overall}</span>
                <span className="muted small">{b.assessor}</span>
                <span className="dt">{fmt(b.start)}</span>
              </div>
              <table>
                <thead><tr><th>Qualification</th><th>Result</th><th>Achieved</th><th>Expires</th></tr></thead>
                <tbody>
                  {b.categories.map((x, i) => (
                    <tr key={i}>
                      <td><b>{x.code}</b> <span className="muted small">{x.desc}</span></td>
                      <td><span className={'b ' + resultClass(x.result)}>{x.result}</span></td>
                      <td className="muted nowrap">{fmt(x.achieved)}</td>
                      <td className="muted nowrap">{fmt(x.expiry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Field({ label, value }) {
  return (
    <div className="field">
      <label className="fl">{label}</label>
      <div style={{ padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, background: '#f7f9fc' }}>{value || '—'}</div>
    </div>
  )
}
